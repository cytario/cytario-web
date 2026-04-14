import { type LoaderFunction } from "react-router";

import { assertAdminScope } from "../assertAdminScope";
import { authContext } from "~/.server/auth/authMiddleware";
import {
  getGroupWithMembers,
  flattenGroupsWithIds,
  collectAllUsers,
} from "~/.server/auth/keycloakAdmin";

export const usersLoader: LoaderFunction = async ({ request, context }) => {
  const { user } = context.get(authContext);
  const { scope } = assertAdminScope(request.url, user.adminScopes);

  const group = await getGroupWithMembers(scope);

  if (!group) {
    return { scope, users: [], groups: [] };
  }

  const users = collectAllUsers(group);
  const groups = flattenGroupsWithIds(group);

  return { scope, users, groups };
};
