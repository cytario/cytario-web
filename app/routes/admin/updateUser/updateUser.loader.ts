import { LoaderFunction } from "react-router";

import { authContext } from "~/.server/auth/authMiddleware";
import { adminFetch, KeycloakUser } from "~/.server/auth/keycloakAdmin";

/**
 * Loads user data for editing. Validates admin permissions for the org/group scope.
 */
export const updateUserLoader: LoaderFunction = async ({ context, params }) => {
  console.time("loader");
  const { user, authTokens } = context.get(authContext);
  const scope = [params.s0, params.s1, params.s2, params.s3].filter(Boolean).join("/");

  const isAdmin = user.adminScopes.some(
    (s) => scope === s || scope.startsWith(s + "/"),
  );
  if (!isAdmin) {
    throw new Response("Not authorized", { status: 403 });
  }

  console.time("kc");
  const keycloakUser = await adminFetch<KeycloakUser>(
    authTokens.accessToken,
    `/users/${params.userId}`,
  );
  console.timeEnd("kc");
  console.timeEnd("loader");

  return { user: keycloakUser, scope };
};
