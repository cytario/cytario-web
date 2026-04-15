import {
  flattenGroupsWithIds,
  getGroupWithMembers,
} from "~/.server/auth/keycloakAdmin";

/**
 * Validates that every groupId belongs to the group tree of the given scope.
 * Prevents cross-scope privilege escalation via forged form fields referencing
 * out-of-scope group UUIDs (e.g., adding an in-scope user to another org's
 * /admins group).
 *
 * Throws 404 if the scope does not exist, 403 if any groupId is out of scope.
 */
export async function assertGroupsInScope(
  groupIds: string[],
  scope: string,
): Promise<void> {
  if (groupIds.length === 0) return;

  const group = await getGroupWithMembers(scope);
  if (!group) throw new Response("Scope not found", { status: 404 });

  const scopeGroupIds = new Set(
    flattenGroupsWithIds(group).map((g) => g.id),
  );

  for (const groupId of groupIds) {
    if (!scopeGroupIds.has(groupId)) {
      throw new Response("Not authorized", { status: 403 });
    }
  }
}
