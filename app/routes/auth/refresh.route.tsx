import { LoaderFunctionArgs, redirect } from "react-router";

import { getSession } from "~/.server/auth/getSession";
import { getUserInfo } from "~/.server/auth/getUserInfo";
import { validateRedirectTo } from "~/.server/auth/oauthState";
import { refreshAccessTokenWithLock } from "~/.server/auth/refreshAuthTokens";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { createLabel } from "~/.server/logging";

const label = createLabel("auth-refresh", "magenta");

/**
 * Generic token-refresh primitive.
 *
 * On an authenticated session, performs a Keycloak `refresh_token` grant,
 * re-fetches the user profile (so newly-present claims like `organization`
 * land on the session), persists both, and redirects to a validated
 * `return_to`. Carries no org/trial/billing logic — callers decide when a
 * refresh is warranted.
 *
 * Any failure (no session, expired/failed refresh) falls back to interactive
 * login rather than erroring.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.info(`${label} Refresh initiated`);

  // Refreshing re-mints tokens, so this GET is state-mutating. Restrict it to
  // top-level navigations: a browser sends `Sec-Fetch-Mode: navigate` for real
  // navigations (incl. server-issued redirects), but `no-cors`/`cors` for
  // cross-site subresource embeds (`<img src=...>`, fetch). Rejecting the
  // latter blocks forced-refresh CSRF and Keycloak amplification. Non-browser
  // clients omit the header and are allowed.
  const fetchMode = request.headers.get("Sec-Fetch-Mode");
  if (fetchMode && fetchMode !== "navigate") {
    console.warn(`${label} Rejected non-navigation request (Sec-Fetch-Mode: ${fetchMode})`);
    return new Response("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const returnTo = validateRedirectTo(url.searchParams.get("return_to") || undefined);
  const loginFallback = `/login?redirect=${encodeURIComponent(returnTo)}`;

  const session = await getSession(request);
  const user = session.get("user");
  const authTokens = session.get("authTokens");

  if (!user || !authTokens?.refreshToken) {
    console.info(`${label} No active session, falling back to login`);
    return redirect(loginFallback);
  }

  try {
    const newAuthTokens = await refreshAccessTokenWithLock(session.id, authTokens.refreshToken);
    const refreshedUser = await getUserInfo(newAuthTokens.accessToken);

    session.set("authTokens", newAuthTokens);
    session.set("user", refreshedUser);

    console.info(`${label} Tokens re-minted, redirecting to:`, returnTo);

    return redirect(returnTo, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  } catch (error) {
    console.error(`${label} Refresh failed, falling back to login:`, error);
    return redirect(loginFallback);
  }
};

// Loading state shown briefly before redirect fires.
export default function RefreshRoute() {
  return (
    <div className="flex items-center justify-center h-screen">
      <p role="status" className="text-muted-foreground">
        Refreshing session...
      </p>
    </div>
  );
}
