import {
  collectAllUsers,
  getGroupWithMembers,
} from "~/.server/auth/keycloakAdmin";

export async function assertUsersInScope(
  userIds: string[],
  scope: string,
): Promise<void> {
  const group = await getGroupWithMembers(scope);
  if (!group) throw new Response("Scope not found", { status: 404 });

  const scopeUserIds = new Set(collectAllUsers(group).map((u) => u.user.id));

  for (const userId of userIds) {
    if (!scopeUserIds.has(userId)) {
      throw new Response("Not authorized", { status: 403 });
    }
  }
}
