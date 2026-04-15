import {
  flattenGroupsWithIds,
  getGroupWithMembers,
} from "~/.server/auth/keycloakAdmin";

/**
 * Validates that every groupPath belongs to the group tree of the given scope.
 * Unlike a pure prefix check on adminScopes, this also verifies the group
 * actually exists in Keycloak — catching forged form input referencing
 * nonexistent paths up front with a 403 instead of a vague downstream error.
 *
 * Throws 404 if the scope does not exist, 403 if any groupPath is out of scope.
 */
export async function assertGroupPathsInScope(
  groupPaths: string[],
  scope: string,
): Promise<void> {
  if (groupPaths.length === 0) return;

  const group = await getGroupWithMembers(scope);
  if (!group) throw new Response("Scope not found", { status: 404 });

  const scopeGroupPaths = new Set(
    flattenGroupsWithIds(group).map((g) => g.path),
  );

  for (const groupPath of groupPaths) {
    if (!scopeGroupPaths.has(groupPath)) {
      throw new Response("Not authorized", { status: 403 });
    }
  }
}
