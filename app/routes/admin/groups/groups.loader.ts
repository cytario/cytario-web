import { type LoaderFunction } from "react-router";

import { authContext } from "~/.server/auth/authMiddleware";
import { getGroupWithMembers } from "~/.server/auth/keycloakAdmin";

export const groupsLoader: LoaderFunction = async ({ request, context }) => {
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

  return { scope, group: group ?? null };
};
