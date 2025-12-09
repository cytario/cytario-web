import { LoaderFunctionArgs, redirect } from "react-router";

import { getSession, getSessionData } from "~/.server/auth/getSession";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { getWellKnownEndpoints } from "~/.server/auth/wellKnownEndpoints";
import { cytarioConfig } from "~/config";

export const loader = async ({
  request,
}: LoaderFunctionArgs): Promise<Response> => {
  const session = await getSession(request);
  const { authTokens } = await getSessionData(session);

  // Get Keycloak's end_session_endpoint
  const wellKnownEndpoints = await getWellKnownEndpoints();

  // Build the logout URL with post_logout_redirect_uri
  const logoutUrl = new URL(wellKnownEndpoints.end_session_endpoint);
  logoutUrl.searchParams.set(
    "post_logout_redirect_uri",
    `${cytarioConfig.endpoints.webapp}/login`
  );

  // Include id_token_hint for better logout behavior
  if (authTokens?.idToken) {
    logoutUrl.searchParams.set("id_token_hint", authTokens.idToken);
  }

  // Destroy the local session and redirect to Keycloak logout
  return redirect(logoutUrl.toString(), {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
};
