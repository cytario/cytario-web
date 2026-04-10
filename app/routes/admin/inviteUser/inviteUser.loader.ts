import { type LoaderFunction } from "react-router";

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
  const scope = new URL(request.url).searchParams.get("scope");

  if (!scope) throw new Response("Missing scope", { status: 400 });

  const isAdmin = user.adminScopes.some(
    (s) => scope === s || scope.startsWith(s + "/"),
  );
  if (!isAdmin) {
    throw new Response("Not authorized", { status: 403 });
  }

  const group = await getGroupWithMembers(scope);

  return { scope, groupOptions: group ? flattenGroupPaths(group) : [scope] };
};
