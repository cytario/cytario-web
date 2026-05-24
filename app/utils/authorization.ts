import type { UserProfile } from "~/.server/auth/getUserInfo";

/**
 * Sentinel admin scope assigned to members of the active org's root `/admins`
 * group. Treated by the helpers below as "admin of every owner scope in the
 * active org". Reserved — must not be used as a real Keycloak group name.
 */
export const ORG_ROOT_ADMIN_SCOPE = "*";

/** Minimal resource shape needed for tenant + intra-org authorization. */
export interface AuthorizationResource {
  organization: string;
  ownerScope: string;
}

/** Tenant boundary: a resource must belong to the user's active organization. */
function inActiveOrg(user: UserProfile, resource: AuthorizationResource): boolean {
  return user.organization !== undefined && user.organization === resource.organization;
}

/**
 * True iff `adminScope` covers `ownerScope`. The `ORG_ROOT_ADMIN_SCOPE`
 * sentinel matches every owner scope within the active org; the tenant check
 * in the public helpers prevents this from leaking across orgs.
 */
function adminCovers(adminScope: string, ownerScope: string): boolean {
  if (adminScope === ORG_ROOT_ADMIN_SCOPE) return true;
  return ownerScope === adminScope || ownerScope.startsWith(adminScope + "/");
}

/**
 * Returns true if the user can see/list/inspect a resource.
 *
 * Tenant boundary: the resource must be in the user's active organization.
 *
 * Within the org:
 * - Personal scope: ownerScope matches user's own sub
 * - Group membership: user belongs to the ownerScope group or a child group
 * - Admin ancestry: user admins a scope that is an ancestor of (or equal to) the ownerScope
 */
export function canSee(user: UserProfile, resource: AuthorizationResource): boolean {
  if (!inActiveOrg(user, resource)) return false;
  const { ownerScope } = resource;
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
  const { ownerScope } = resource;
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
  const { ownerScope } = resource;
  if (ownerScope === user.sub) return true;
  return user.adminScopes.some((scope) => adminCovers(scope, ownerScope));
}

/**
 * Filters a list of resources to only those the user can see.
 */
export function filterVisible<T extends AuthorizationResource>(user: UserProfile, resources: T[]) {
  return resources.filter((r) => canSee(user, r));
}
