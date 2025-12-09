import { LoaderFunctionArgs, redirect } from "react-router";

import { exchangeAuthCode } from "~/.server/auth/exchangeAuthCode";
import { getSession } from "~/.server/auth/getSession";
import { getUserInfo } from "~/.server/auth/getUserInfo";
import { validateOAuthState } from "~/.server/auth/oauthState";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { createLabel } from "~/.server/logging";
import { NotificationInput } from "~/components/Notification/Notification.store";
import { cytarioConfig } from "~/config";

const label = createLabel("auth-callback", "cyan");

/**
 * OAuth 2.0 Authorization Code Flow callback handler.
 * This route receives the authorization code from Keycloak after successful authentication.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.info(`${label} Callback received`);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Handle errors from authorization server
  if (error) {
    console.error(`${label} Authorization error:`, error, errorDescription);
    const notification: NotificationInput = {
      status: "error",
      message: errorDescription || `Authentication failed: ${error}`,
    };
    const session = await getSession(request);
    session.set("notification", notification);
    return redirect("/login", {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  }

  // Validate required parameters
  if (!code || !state) {
    console.error(`${label} Missing code or state parameter`);
    return redirect("/login?error=missing_parameters");
  }

  try {
    // Validate state to prevent CSRF attacks
    const stateData = await validateOAuthState(state);
    if (!stateData) {
      console.error(`${label} Invalid or expired state parameter`);
      return redirect("/login?error=invalid_state");
    }

    console.info(`${label} State validated successfully`);

    // Build the redirect URI (must match what was sent to authorization endpoint)
    const redirectUri = `${cytarioConfig.endpoints.webapp}/auth/callback`;

    // Exchange authorization code for tokens
    console.info(`${label} Exchanging authorization code for tokens`);
    const tokens = await exchangeAuthCode(code, redirectUri);

    // Get user info using the access token
    console.info(`${label} Fetching user info`);
    const user = await getUserInfo(tokens.access_token);

    const notification: NotificationInput = {
      status: "success",
      message: `Welcome, ${user.email}!`,
    };

    // Create session with user data and tokens
    const session = await getSession(request);
    session.set("user", user);
    session.set("authTokens", {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
    });
    session.set("notification", notification);

    // Redirect to the originally requested page or default to home
    const redirectTo = stateData.redirectTo || "/";
    console.info(
      `${label} Authentication successful, redirecting to:`,
      redirectTo
    );

    return redirect(redirectTo, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  } catch (error) {
    console.error(`${label} Authentication failed:`, error);
    const notification: NotificationInput = {
      status: "error",
      message:
        error instanceof Error ? error.message : "Authentication failed.",
    };
    const session = await getSession(request);
    session.set("notification", notification);
    return redirect("/login", {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  }
};

// This route only handles redirects, no UI needed
export default function CallbackRoute() {
  return null;
}
