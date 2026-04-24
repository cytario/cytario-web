import { H1 } from "@cytario/design";
import { data, LoaderFunctionArgs, redirect, useLoaderData } from "react-router";

import { exchangeAuthCode } from "~/.server/auth/exchangeAuthCode";
import { getSession } from "~/.server/auth/getSession";
import { getUserInfo } from "~/.server/auth/getUserInfo";
import { validateOAuthState, validateRedirectTo } from "~/.server/auth/oauthState";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { verifyIdToken } from "~/.server/auth/verifyIdToken";
import { createLabel } from "~/.server/logging";
import { Section } from "~/components/Container";
import { NotificationInput } from "~/components/Notification/Notification.store";
import { cytarioConfig } from "~/config";

const label = createLabel("auth-callback", "cyan");

/**
 * Renders a terminal error page for the callback.
 * Does NOT redirect to /login — an IdP SSO session would immediately bounce the
 * browser back here, producing an infinite redirect loop (see the email-verify
 * flow, where the state TTL can elapse before the user clicks the link).
 */
const respondWithError = async (request: Request, message: string) => {
  const session = await getSession(request);
  return data(
    { error: message },
    {
      status: 400,
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    },
  );
};

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
    return respondWithError(
      request,
      errorDescription || "Authentication failed. Please try again.",
    );
  }

  // Validate required parameters
  if (!code || !state) {
    console.error(`${label} Missing code or state parameter`);
    return respondWithError(
      request,
      "Authentication failed. Missing required parameters.",
    );
  }

  try {
    // Validate state to prevent CSRF attacks (atomic GETDEL)
    const stateData = await validateOAuthState(state);
    if (!stateData) {
      console.error(`${label} Invalid or expired state parameter`);
      return respondWithError(
        request,
        "Authentication session expired. Please try again.",
      );
    }

    // Guard for in-flight states from before PKCE deployment
    if (!stateData.codeVerifier || !stateData.nonce) {
      console.error(`${label} State missing codeVerifier or nonce`);
      return respondWithError(
        request,
        "Authentication session invalid. Please try again.",
      );
    }

    console.info(`${label} State validated successfully`);

    // Build the redirect URI (must match what was sent to authorization endpoint)
    const redirectUri = `${cytarioConfig.endpoints.webapp}/auth/callback`;

    // Exchange authorization code for tokens with PKCE verifier
    console.info(`${label} Exchanging authorization code for tokens`);
    const tokens = await exchangeAuthCode(
      code,
      redirectUri,
      stateData.codeVerifier,
    );

    // Verify ID token signature via JWKS and validate nonce from verified payload
    const idTokenPayload = await verifyIdToken(tokens.id_token);
    if (!idTokenPayload) {
      console.error(`${label} ID token signature verification failed`);
      return respondWithError(
        request,
        "Authentication failed. Please try again.",
      );
    }

    if (idTokenPayload.nonce !== stateData.nonce) {
      console.error(`${label} Nonce mismatch in ID token`);
      return respondWithError(
        request,
        "Authentication failed. Please try again.",
      );
    }

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
    const redirectTo = validateRedirectTo(stateData.redirectTo);
    console.info(
      `${label} Authentication successful, redirecting to:`,
      redirectTo,
    );

    return redirect(redirectTo, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  } catch (error) {
    console.error(`${label} Authentication failed:`, error);
    return respondWithError(
      request,
      "Authentication failed. Please try again.",
    );
  }
};

export default function CallbackRoute() {
  const loaderData = useLoaderData<typeof loader>();

  if (loaderData && "error" in loaderData) {
    return (
      <Section>
        <div className="container mx-auto px-4 max-w-lg" role="alert">
          <H1>Sign-in failed</H1>
          <p className="mt-4 text-slate-700">{loaderData.error}</p>
          <a
            href="/login"
            className="text-cytario-purple-500 underline mt-6 inline-block"
          >
            Try signing in again
          </a>
        </div>
      </Section>
    );
  }

  return null;
}
