import { LoaderFunction } from "react-router";

import { assertUsersInScope } from "../assertUsersInScope";
import { adminContext } from "~/.server/auth/adminMiddleware";
import { authContext } from "~/.server/auth/authMiddleware";
import { getUser } from "~/.server/auth/keycloakAdmin";

export const updateUserLoader: LoaderFunction = async ({ context, params }) => {
  const { requestOrganization } = context.get(authContext);
  const { scope } = context.get(adminContext);

  await assertUsersInScope([params.userId!], scope, requestOrganization);

  const keycloakUser = await getUser(params.userId!);

  return { user: keycloakUser, scope };
};
