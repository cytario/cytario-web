import { type LoaderFunction } from "react-router";

import { authContext } from "~/.server/auth/authMiddleware";
import {
  getGroupWithMembers,
  GroupWithMembers,
} from "~/.server/auth/keycloakAdmin/groups";

function flattenGroupPaths(group: GroupWithMembers): string[] {
  return [group.path, ...group.subGroups.flatMap(flattenGroupPaths)];
}

export const inviteUserLoader: LoaderFunction = async ({ context, params }) => {
  const { user, authTokens } = context.get(authContext);
  const scope = [params.s0, params.s1, params.s2, params.s3].filter(Boolean).join("/");

  const isAdmin = user.adminScopes.some(
    (s) => scope === s || scope.startsWith(s + "/"),
  );
  if (!isAdmin) {
    throw new Response("Not authorized", { status: 403 });
  }

  const group = await getGroupWithMembers(authTokens.accessToken, scope);

  return { scope, groupOptions: group ? flattenGroupPaths(group) : [scope] };
};
