import { type LoaderFunction } from "react-router";

import { assertAdminScope } from "../assertAdminScope";
import { authContext } from "~/.server/auth/authMiddleware";

export const inviteUserLoader: LoaderFunction = async ({ request, context }) => {
  const { user } = context.get(authContext);
  const { scope } = assertAdminScope(request.url, user.adminScopes);

  return { scope, organization: user.organization ?? null };
};
