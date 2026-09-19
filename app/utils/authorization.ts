import type { UserProfile } from "~/.server/auth/getUserInfo";

/**
 * Sentinel scope representing the active organization as a whole: as an
 * adminScope it covers every owner scope in the org; as an ownerScope it is
 * visible to every member, but mutation still requires an admin scope that
 * covers `*`. Reserved — never a real Keycloak group name (enforced by
 * `createGroupSchema`).
 */
export const ORG_ROOT_SCOPE = "*";

/**
 * A resource names its intra-org owner scope either as `ownerScope` (users,
 * groups) or as `scope` (a connection grant); a connection carries one or more
 * grants and is visible/modifiable when the user covers ANY of their scopes.
 */
export interface AuthorizationResource {
  organization: string;
  ownerScope?: string;
  scope?: string;
  grants?: Array<{ scope: string }>;
}

/** The owner scopes of a resource: `ownerScope` (or legacy single `scope`) for
 * plain resources, `grants[].scope` for multi-grant connections. */
function ownerScopesOf(resource: AuthorizationResource): string[] {
  if (resource.grants && resource.grants.length > 0) {
    return resource.grants.map((g) => g.scope);
  }
  const single = resource.ownerScope ?? resource.scope ?? "";
  return single ? [single] : [];
}

/** Tenant boundary: a resource must belong to the user's active organization. */
function inActiveOrg(user: UserProfile, resource: AuthorizationResource): boolean {
  return user.organization !== undefined && user.organization === resource.organization;
}

/** Single source of truth for "does this admin scope cover that target scope",
 * reused by canSee/canModify/canCreate and the admin route guards. */
export function adminCovers(adminScope: string, ownerScope: string): boolean {
  if (adminScope === ORG_ROOT_SCOPE) return true;
  return ownerScope === adminScope || ownerScope.startsWith(adminScope + "/");
}

/** True iff any admin scope covers `targetScope`; the `*` target is only
 * coverable by an org-root admin, never by a named-scope admin. */
export function adminScopesCover(adminScopes: string[], targetScope: string): boolean {
  if (targetScope === ORG_ROOT_SCOPE) return adminScopes.includes(ORG_ROOT_SCOPE);
  return adminScopes.some((adminScope) => adminCovers(adminScope, targetScope));
}

/** Can the user see/list/inspect the resource (tenant + intra-org rules)?
 * Org-root scope is visible to every org member; group membership in the
 * ownerScope group or a child also grants visibility. A multi-grant connection
 * is visible when ANY of its grants' scopes is visible. */
export function canSee(user: UserProfile, resource: AuthorizationResource): boolean {
  if (!inActiveOrg(user, resource)) return false;
  return ownerScopesOf(resource).some((ownerScope) => canSeeScope(user, ownerScope));
}

function canSeeScope(user: UserProfile, ownerScope: string): boolean {
  if (ownerScope === ORG_ROOT_SCOPE) return true;
  if (ownerScope === user.sub) return true;
  if (user.groups.includes(ownerScope)) return true;
  if (user.groups.some((g) => g.startsWith(ownerScope + "/"))) return true;
  return user.adminScopes.some((scope) => adminCovers(scope, ownerScope));
}

/** Can the user modify/delete the resource? Group membership alone is NOT
 * sufficient — admin ancestry is required. A multi-grant connection is
 * modifiable when ANY of its grants' scopes is administered. */
export function canModify(user: UserProfile, resource: AuthorizationResource): boolean {
  if (!inActiveOrg(user, resource)) return false;
  return ownerScopesOf(resource).some((ownerScope) => canModifyScope(user, ownerScope));
}

function canModifyScope(user: UserProfile, ownerScope: string): boolean {
  if (ownerScope === user.sub) return true;
  return user.adminScopes.some((scope) => adminCovers(scope, ownerScope));
}

/** Can the user create a resource under the target scope? */
export function canCreate(user: UserProfile, resource: AuthorizationResource): boolean {
  if (!inActiveOrg(user, resource)) return false;
  const ownerScope = resource.ownerScope ?? resource.scope ?? "";
  if (ownerScope === user.sub) return true;
  return user.adminScopes.some((scope) => adminCovers(scope, ownerScope));
}

export function filterVisible<T extends AuthorizationResource>(user: UserProfile, resources: T[]) {
  return resources.filter((r) => canSee(user, r));
}
