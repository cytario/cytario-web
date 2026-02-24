import { type LoaderFunction } from "react-router";

import { authContext } from "~/.server/auth/authMiddleware";
import {
  type GroupWithMembers,
  getGroupWithMembers,
  flattenGroupsWithIds,
  collectAllUsers,
} from "~/.server/auth/keycloakAdmin";

export interface GroupTreeNode {
  id: string;
  name: string;
  path: string;
  memberCount: number;
  subGroups: GroupTreeNode[];
}

function toGroupTree(group: GroupWithMembers): GroupTreeNode {
  return {
    id: group.id,
    name: group.name,
    path: group.path,
    memberCount: group.members.length,
    subGroups: group.subGroups.map(toGroupTree),
  };
}

export const usersLoader: LoaderFunction = async ({ request, context }) => {
  const { user, authTokens } = context.get(authContext);
  const scope = new URL(request.url).searchParams.get("scope");

  if (!scope) throw new Response("Missing scope", { status: 400 });

  const isAdmin = user.adminScopes.some(
    (s) => scope === s || scope.startsWith(s + "/"),
  );

  if (!isAdmin) {
    throw new Response("Not authorized", { status: 403 });
  }

  const group = await getGroupWithMembers(authTokens.accessToken, scope);

  if (!group) {
    return { scope, users: [], groups: [], groupTree: null };
  }

  const users = collectAllUsers(group);
  const groups = flattenGroupsWithIds(group);
  const groupTree = toGroupTree(group);

  return { scope, users, groups, groupTree };
};
