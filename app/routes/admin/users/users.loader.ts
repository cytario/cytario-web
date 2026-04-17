import { type LoaderFunction } from "react-router";

import { assertAdminScope } from "../assertAdminScope";
import { authContext } from "~/.server/auth/authMiddleware";
import {
  getGroupWithMembers,
  flattenGroupsWithIds,
  collectAllUsers,
} from "~/.server/auth/keycloakAdmin";
import { listConnections } from "~/routes/connections/connections.server";

export const usersLoader: LoaderFunction = async ({ request, context }) => {
  const { user } = context.get(authContext);
  const { scope } = assertAdminScope(request.url, user.adminScopes);

  const [group, allConnections] = await Promise.all([
    getGroupWithMembers(scope),
    // All connections the user is authorized to see (canSee filter)
    listConnections(user),
  ]);

  // Narrow to exact scope — connections are not inherited from parent scopes
  const connections = allConnections.filter((c) => c.ownerScope === scope);

  if (!group) {
    return { scope, users: [], groups: [], connections };
  }

  const users = collectAllUsers(group);
  const groups = flattenGroupsWithIds(group);

  return { scope, users, groups, connections };
};
