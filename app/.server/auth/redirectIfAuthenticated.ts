import { LoaderFunctionArgs, redirect } from "react-router";

import { getSession, getSessionData } from "~/.server/auth/getSession";

export const redirectIfAuthenticated = async ({ request }: LoaderFunctionArgs): Promise<void> => {
  const session = await getSession(request);
  const { user } = await getSessionData(session);

  if (user) {
    throw redirect("/");
  }

  return;
};
