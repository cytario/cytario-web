import type { UserProfile } from "./getUserInfo";

/**
 * Returns true if the user can see/list/inspect a resource with the given ownerScope.
 *
 * Rules:
 * - Realm admin can see everything
 * - Personal scope: ownerScope matches user's own id
 * - Group membership: user belongs to the ownerScope group or a child group
 * - Admin ancestry: user admins a scope that is an ancestor of (or equal to) the ownerScope
 */
export function canSee(user: UserProfile, ownerScope: string): boolean {
  if (user.isRealmAdmin) return true;
  if (ownerScope === user.sub) return true;
  if (user.groups.includes(ownerScope)) return true;
  if (user.groups.some((g) => g.startsWith(ownerScope + "/"))) return true;
  return user.adminScopes.some(
    (scope) => ownerScope === scope || ownerScope.startsWith(scope + "/"),
  );
}

/**
 * Returns true if the user can modify or delete a resource with the given ownerScope.
 *
 * Rules:
 * - Realm admin can modify anything
 * - Personal scope: user can modify their own resources
 * - Admin ancestry: user admins a scope that is an ancestor of (or equal to) the ownerScope
 *
 * Note: group membership alone is NOT sufficient — must be admin.
 */
export function canModify(user: UserProfile, ownerScope: string): boolean {
  if (user.isRealmAdmin) return true;
  if (ownerScope === user.sub) return true;
  return user.adminScopes.some(
    (scope) => ownerScope === scope || ownerScope.startsWith(scope + "/"),
  );
}

/**
 * Returns true if the user can create a resource in the given ownerScope.
 *
 * Rules:
 * - Realm admin can create anywhere
 * - Personal scope (ownerScope === sub): always allowed
 * - Group scope: user must be admin of that scope
 */
export function canCreate(user: UserProfile, ownerScope: string): boolean {
  if (user.isRealmAdmin) return true;
  if (ownerScope === user.sub) return true;
  return user.adminScopes.some(
    (scope) => ownerScope === scope || ownerScope.startsWith(scope + "/"),
  );
}

/**
 * Returns the scopes a user is allowed to create resources in.
 * Used by the UI to populate the scope selector dropdown.
 */
export function getCreatableScopes(user: UserProfile): {
  personalScope: string;
  adminScopes: string[];
} {
  return {
    personalScope: user.sub,
    adminScopes: user.adminScopes,
  };
}

/**
 * Filters a list of resources to only those the user can see.
 */
export function filterVisible<T extends { ownerScope: string }>(
  user: UserProfile,
  resources: T[],
): T[] {
  if (user.isRealmAdmin) return resources;
  return resources.filter((r) => canSee(user, r.ownerScope));
}
