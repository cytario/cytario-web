import {
  collectAllUsers,
  findOrganizationByAlias,
  getGroupWithMembers,
} from "~/.server/auth/keycloakAdmin";

/**
 * Validates that every userId belongs to the active org's `scope` tree.
 * Routes through Keycloak 26.6's Organization Groups endpoints so the lookup
 * is isolated to the active organization.
 */
export async function assertUsersInScope(
  userIds: string[],
  scope: string,
  orgAlias: string | undefined,
): Promise<void> {
  if (userIds.length === 0) return;
  if (!orgAlias) throw new Response("No active organization", { status: 400 });

  const org = await findOrganizationByAlias(orgAlias);
  if (!org) throw new Response("Organization not found", { status: 404 });

  const group = await getGroupWithMembers(org.id, scope);
  if (!group) throw new Response("Scope not found", { status: 404 });

  const scopeUserIds = new Set(collectAllUsers(group).map((u) => u.user.id));

  for (const userId of userIds) {
    if (!scopeUserIds.has(userId)) {
      throw new Response("Not authorized", { status: 403 });
    }
  }
}
