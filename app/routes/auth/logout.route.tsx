import { LoaderFunctionArgs, redirect } from "react-router";

import { getSession, getSessionData } from "~/.server/auth/getSession";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { getWellKnownEndpoints } from "~/.server/auth/wellKnownEndpoints";
import { createLabel } from "~/.server/logging";
import { cytarioConfig } from "~/config";

const { clientId, clientSecret } = cytarioConfig.auth;
const label = createLabel("logout", "magenta");

// Best-effort: revocation failures must never block logout.
const revokeRefreshToken = async (
  refreshToken: string,
  revocationEndpoint: string,
): Promise<void> => {
  try {
    const response = await fetch(revocationEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        token: refreshToken,
        token_type_hint: "refresh_token",
      }),
    });

    if (!response.ok) {
      console.warn(`${label} Token revocation returned ${response.status}`);
    }
  } catch (error) {
    console.warn(`${label} Token revocation failed:`, error);
  }
};

export const loader = async ({ request }: LoaderFunctionArgs): Promise<Response> => {
  const session = await getSession(request);
  const { authTokens } = await getSessionData(session);

  const wellKnownEndpoints = await getWellKnownEndpoints();

  if (authTokens?.refreshToken) {
    console.info(`${label} Revoking refresh token`);
    await revokeRefreshToken(authTokens.refreshToken, wellKnownEndpoints.revocation_endpoint);
  }

  const logoutUrl = new URL(wellKnownEndpoints.end_session_endpoint);
  logoutUrl.searchParams.set("post_logout_redirect_uri", `${cytarioConfig.endpoints.webapp}/login`);

  if (authTokens?.idToken) {
    logoutUrl.searchParams.set("id_token_hint", authTokens.idToken);
  }

  return redirect(logoutUrl.toString(), {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
};

export default function LogoutRoute() {
  return null;
}
