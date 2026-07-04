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
 * `scope` (a storage connection, whose owner-scope column is `scope`); both carry
 * the identical org-relative group path / user sub / `*` sentinel.
 */
export interface AuthorizationResource {
  organization: string;
  ownerScope?: string;
  scope?: string;
}

/** The resource's owner scope, sourced from `ownerScope` or the connection's `scope`. */
function ownerScopeOf(resource: AuthorizationResource): string {
  return resource.ownerScope ?? resource.scope ?? "";
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
 * - Personal scope: ownerScope matches user's own sub
 * - Group membership: user belongs to the ownerScope group or a child group
 * - Admin ancestry: user admins a scope that is an ancestor of (or equal to) the ownerScope
 */
export function canSee(user: UserProfile, resource: AuthorizationResource): boolean {
  if (!inActiveOrg(user, resource)) return false;
  const ownerScope = ownerScopeOf(resource);
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
 * - Personal scope: user can modify their own resources
 * - Admin ancestry: user admins a scope that is an ancestor of (or equal to) the ownerScope
 *
 * Note: group membership alone is NOT sufficient — must be admin.
 */
export function canModify(user: UserProfile, resource: AuthorizationResource): boolean {
  if (!inActiveOrg(user, resource)) return false;
  const ownerScope = ownerScopeOf(resource);
  if (ownerScope === user.sub) return true;
  return user.adminScopes.some((scope) => adminCovers(scope, ownerScope));
}

/**
 * Returns true if the user can create a resource in the given target.
 *
 * Tenant boundary: the target must be in the user's active organization.
 *
 * Within the org:
 * - Personal scope (ownerScope === sub): always allowed
 * - Group scope: user must be admin of an ancestor scope
 */
export function canCreate(user: UserProfile, resource: AuthorizationResource): boolean {
  if (!inActiveOrg(user, resource)) return false;
  const ownerScope = ownerScopeOf(resource);
  if (ownerScope === user.sub) return true;
  return user.adminScopes.some((scope) => adminCovers(scope, ownerScope));
}

/**
 * Filters a list of resources to only those the user can see.
 */
export function filterVisible<T extends AuthorizationResource>(user: UserProfile, resources: T[]) {
  return resources.filter((r) => canSee(user, r));
}
