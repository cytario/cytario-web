import { LoaderFunction } from "react-router";

import { assertAdminScope } from "../assertAdminScope";
import { assertUsersInScope } from "../assertUsersInScope";
import { authContext } from "~/.server/auth/authMiddleware";
import { getUser } from "~/.server/auth/keycloakAdmin";

/**
 * Loads user data for editing. Validates admin permissions for the org/group scope.
 */
export const updateUserLoader: LoaderFunction = async ({ request, context, params }) => {
  const { user } = context.get(authContext);
  const { scope } = assertAdminScope(request.url, user.adminScopes);

  await assertUsersInScope([params.userId!], scope);

  const keycloakUser = await getUser(params.userId!);

  return { user: keycloakUser, scope };
};
