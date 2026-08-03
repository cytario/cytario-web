import { Description } from "@cytario/design";
import { LoaderFunctionArgs, redirect } from "react-router";

import { getSession } from "~/.server/auth/getSession";
import { generateOAuthState, validateRedirectTo } from "~/.server/auth/oauthState";
import { getWellKnownEndpoints } from "~/.server/auth/wellKnownEndpoints";
import { createLabel } from "~/.server/logging";
import { cytarioConfig } from "~/config";

const label = createLabel("auth-refresh", "magenta");

/**
 * Generic claim-refresh primitive via OIDC silent re-authentication.
 *
 * A `refresh_token` grant only reissues a token from the cached Keycloak
 * session, so claims resolved out-of-band after login (e.g. an `organization`
 * membership added via the admin API) never appear. This route instead starts
 * an Authorization Code flow with `prompt=none`: Keycloak reuses the existing
 * SSO cookie (no interactive prompt) but performs a fresh authentication that
 * re-resolves membership and re-runs mappers, so the new token carries the
 * current claims. `/auth/callback` completes the exchange and writes the
 * session as usual.
 *
 * Carries no org/trial/billing logic — callers decide when a refresh is
 * warranted. No session, or a Keycloak `login_required`/`interaction_required`
 * (handled in the callback), falls back to interactive login.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.info(`${label} Silent refresh initiated`);

  // Re-authenticating mutates the session, so this GET is state-changing.
  // Restrict it to top-level navigations: a browser sends `Sec-Fetch-Mode:
  // navigate` for real navigations (incl. server-issued redirects), but
  // `no-cors`/`cors` for cross-site subresource embeds (`<img src=...>`,
  // fetch). Rejecting the latter blocks forced-refresh CSRF and Keycloak
  // amplification. Non-browser clients omit the header and are allowed.
  const fetchMode = request.headers.get("Sec-Fetch-Mode");
  if (fetchMode && fetchMode !== "navigate") {
    console.warn(`${label} Rejected non-navigation request (Sec-Fetch-Mode: ${fetchMode})`);
    return new Response("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const returnTo = validateRedirectTo(url.searchParams.get("return_to") || undefined);
  const loginFallback = `/login?redirect=${encodeURIComponent(returnTo)}`;

  const session = await getSession(request);
  if (!session.get("user")) {
    console.info(`${label} No active session, falling back to interactive login`);
    return redirect(loginFallback);
  }

  try {
    const { state, codeChallenge, nonce } = await generateOAuthState(
      returnTo === "/" ? undefined : returnTo,
    );

    const wellKnownEndpoints = await getWellKnownEndpoints();

    const redirectUri = `${cytarioConfig.endpoints.webapp}/auth/callback`;
    const authUrl = new URL(wellKnownEndpoints.authorization_endpoint);
    authUrl.searchParams.set("client_id", cytarioConfig.auth.clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", cytarioConfig.auth.scopes.join(" "));
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("nonce", nonce);
    // Silent re-authentication: reuse the SSO session, never show a prompt.
    authUrl.searchParams.set("prompt", "none");

    console.info(`${label} Redirecting to Keycloak for silent re-authentication`);

    return redirect(authUrl.toString());
  } catch (error) {
    console.error(`${label} Failed to initiate silent refresh:`, error);
    return redirect(loginFallback);
  }
};

// Loading state shown briefly before redirect fires.
export default function RefreshRoute() {
  return (
    <div className="flex items-center justify-center h-screen">
      <Description role="status" className="mb-0">
        Refreshing session...
      </Description>
    </div>
  );
}
