import { LoaderFunction } from "react-router";

import { authContext } from "~/.server/auth/authMiddleware";
import { adminFetch, KeycloakUser } from "~/.server/auth/keycloakAdmin";

/**
 * Loads user data for editing. Validates admin permissions for the org/group scope.
 */
export const updateUserLoader: LoaderFunction = async ({ request, context, params }) => {
  const { user, authTokens } = context.get(authContext);
  const scope = new URL(request.url).searchParams.get("scope");

  if (!scope) throw new Response("Missing scope", { status: 400 });

  const isAdmin = user.adminScopes.some(
    (s) => scope === s || scope.startsWith(s + "/"),
  );
  if (!isAdmin) {
    throw new Response("Not authorized", { status: 403 });
  }

  const keycloakUser = await adminFetch<KeycloakUser>(
    authTokens.accessToken,
    `/users/${params.userId}`,
  );

  return { user: keycloakUser, scope };
};
