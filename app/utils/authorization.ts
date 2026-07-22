import type { UserProfile } from "~/.server/auth/getUserInfo";

/**
 * Sentinel scope representing the active organization as a whole.
 *
 * - As an `adminScope`: the bearer is org-root admin and can see/modify every
 *   owner scope within the active org.
 * - As an `ownerScope`: the resource is owned at the org root and visible to
 *   every member of the active org. Mutation still requires an admin scope
 *   that covers `*` — i.e. another org-root admin.
 *
 * Reserved — must not be used as a real Keycloak group name (enforced by
 * `createGroupSchema`).
 */
export const ORG_ROOT_SCOPE = "*";

/**
 * Minimal resource shape needed for tenant + intra-org authorization. A resource
 * names its intra-org owner scope either as `ownerScope` (users, groups) or as
 * `scope` (a connection grant, whose owner-scope column is `scope`); both carry
 * the identical org-relative group path / user sub / `*` sentinel. A connection
 * carries one or more grants — each a (group scope, provider role) pair — and the
 * resource is visible/modifiable when the user can see/modify ANY of its grants'
 * scopes.
 */
export interface AuthorizationResource {
  organization: string;
  ownerScope?: string;
  scope?: string;
  grants?: Array<{ scope: string }>;
}

/**
 * The owner scopes of a resource: a plain resource carries `ownerScope` (or the
 * legacy single-`scope`), a multi-grant connection carries `grants[].scope`.
 * Returns the scopes the resource is administered/visible under.
 */
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

/**
 * Admin-scope ancestry predicate: an admin authority over
 * `adminScope` covers `ownerScope` iff it is the org-root sentinel, an exact
 * match, or a strict ancestor. This is the single source of truth for "does this
 * admin scope cover that target scope", reused by `canSee`/`canModify`/
 * `canCreate` here and by the request guards in `app/routes/admin/*` — so the
 * Share write's server-side grant authorization evaluates the
 * identical rule as user management.
 */
export function adminCovers(adminScope: string, ownerScope: string): boolean {
  if (adminScope === ORG_ROOT_SCOPE) return true;
  return ownerScope === adminScope || ownerScope.startsWith(adminScope + "/");
}

/**
 * True iff any of the user's admin scopes covers `targetScope`. The `*` sentinel
 * target is only coverable by an org-root admin (a bearer of `*`), never by a
 * named-scope admin.
 */
export function adminScopesCover(adminScopes: string[], targetScope: string): boolean {
  if (targetScope === ORG_ROOT_SCOPE) return adminScopes.includes(ORG_ROOT_SCOPE);
  return adminScopes.some((adminScope) => adminCovers(adminScope, targetScope));
}

/**
 * Returns true if the user can see/list/inspect a resource.
 *
 * Tenant boundary: the resource must be in the user's active organization.
 *
 * Within the org:
 * - Org-root scope (`*`): visible to every org member
 * - Group membership: user belongs to the ownerScope group or a child group
 * - Admin ancestry: user admins a scope that is an ancestor of (or equal to) the ownerScope
 *
 * A multi-grant connection is visible when the user can see ANY of its grants'
 * scopes.
 */
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

/**
 * Returns true if the user can modify or delete a resource.
 *
 * Tenant boundary: the resource must be in the user's active organization.
 *
 * Within the org:
 * - Admin ancestry: user admins a scope that is an ancestor of (or equal to) the ownerScope
 *
 * Note: group membership alone is NOT sufficient — must be admin.
 *
 * A multi-grant connection is modifiable when the user can modify ANY of its
 * grants' scopes (connection-level fields like name/prefix are editable when at
 * least one grant is administered).
 */
export function canModify(user: UserProfile, resource: AuthorizationResource): boolean {
  if (!inActiveOrg(user, resource)) return false;
  return ownerScopesOf(resource).some((ownerScope) => canModifyScope(user, ownerScope));
}

function canModifyScope(user: UserProfile, ownerScope: string): boolean {
  if (ownerScope === user.sub) return true;
  return user.adminScopes.some((scope) => adminCovers(scope, ownerScope));
}

/**
 * Returns true if the user can create a resource in the given target.
 *
 * Tenant boundary: the target must be in the user's active organization.
 *
 * Within the org:
 * - Group scope: user must be admin of an ancestor scope
 */
export function canCreate(user: UserProfile, resource: AuthorizationResource): boolean {
  if (!inActiveOrg(user, resource)) return false;
  const ownerScope = resource.ownerScope ?? resource.scope ?? "";
  if (ownerScope === user.sub) return true;
  return user.adminScopes.some((scope) => adminCovers(scope, ownerScope));
}

/**
 * Filters a list of resources to only those the user can see.
 */
export function filterVisible<T extends AuthorizationResource>(user: UserProfile, resources: T[]) {
  return resources.filter((r) => canSee(user, r));
}
