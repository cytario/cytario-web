import { type LoaderFunction } from "react-router";

import { adminContext } from "~/.server/auth/adminMiddleware";

export const inviteUserLoader: LoaderFunction = async ({ context }) => {
  const { org, scope } = context.get(adminContext);

  return { scope, organization: org.alias };
};
