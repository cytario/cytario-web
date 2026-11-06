import type { UserProfile } from "~/.server/auth/getUserInfo";
import { orgEntitlements } from "~/.server/auth/getUserInfo";

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

/** Tenant boundary: a resource must belong to the org the request acts in.
 * The org is the caller's request org — never read off the profile, which
 * carries only the membership map. */
function inRequestOrg(organization: string | undefined, resource: AuthorizationResource): boolean {
  return organization !== undefined && organization === resource.organization;
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
 * is visible when ANY of its grants' scopes is visible. The org-scoped
 * groups/adminScopes are derived from the membership map here — the profile
 * carries no projected copy. */
export function canSee(
  user: UserProfile,
  resource: AuthorizationResource,
  organization: string | undefined,
): boolean {
  if (!inRequestOrg(organization, resource)) return false;
  const { groups, adminScopes } = orgEntitlements(user, organization);
  return ownerScopesOf(resource).some((ownerScope) =>
    canSeeScope(user, groups, adminScopes, ownerScope),
  );
}

function canSeeScope(
  user: UserProfile,
  groups: readonly string[],
  adminScopes: readonly string[],
  ownerScope: string,
): boolean {
  if (ownerScope === ORG_ROOT_SCOPE) return true;
  if (ownerScope === user.sub) return true;
  if (groups.includes(ownerScope)) return true;
  if (groups.some((g) => g.startsWith(ownerScope + "/"))) return true;
  return adminScopes.some((scope) => adminCovers(scope, ownerScope));
}

/** Can the user modify/delete the resource? Group membership alone is NOT
 * sufficient — admin ancestry is required. A multi-grant connection is
 * modifiable when ANY of its grants' scopes is administered. */
export function canModify(
  user: UserProfile,
  resource: AuthorizationResource,
  organization: string | undefined,
): boolean {
  if (!inRequestOrg(organization, resource)) return false;
  const { adminScopes } = orgEntitlements(user, organization);
  return ownerScopesOf(resource).some((ownerScope) =>
    canModifyScope(user, adminScopes, ownerScope),
  );
}

function canModifyScope(
  user: UserProfile,
  adminScopes: readonly string[],
  ownerScope: string,
): boolean {
  if (ownerScope === user.sub) return true;
  return adminScopes.some((scope) => adminCovers(scope, ownerScope));
}

/** Can the user create a resource under the target scope? */
export function canCreate(
  user: UserProfile,
  resource: AuthorizationResource,
  organization: string | undefined,
): boolean {
  if (!inRequestOrg(organization, resource)) return false;
  const ownerScope = resource.ownerScope ?? resource.scope ?? "";
  if (ownerScope === user.sub) return true;
  const { adminScopes } = orgEntitlements(user, organization);
  return adminScopes.some((scope) => adminCovers(scope, ownerScope));
}

export function filterVisible<T extends AuthorizationResource>(
  user: UserProfile,
  resources: T[],
  organization: string | undefined,
) {
  return resources.filter((r) => canSee(user, r, organization));
}
