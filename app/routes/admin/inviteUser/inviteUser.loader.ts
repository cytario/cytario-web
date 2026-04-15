import { type LoaderFunction } from "react-router";

import { assertAdminScope } from "../assertAdminScope";
import { authContext } from "~/.server/auth/authMiddleware";
import {
  getGroupWithMembers,
  GroupWithMembers,
} from "~/.server/auth/keycloakAdmin/groups";

function flattenGroupPaths(group: GroupWithMembers): string[] {
  return [group.path, ...group.subGroups.flatMap(flattenGroupPaths)];
}

export const inviteUserLoader: LoaderFunction = async ({ request, context }) => {
  const { user } = context.get(authContext);
  const { scope } = assertAdminScope(request.url, user.adminScopes);

  const group = await getGroupWithMembers(scope);

  return { scope, groupOptions: group ? flattenGroupPaths(group) : [scope] };
};
