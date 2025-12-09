import { LoaderFunctionArgs, redirect, MetaFunction } from "react-router";

import { getSession } from "~/.server/auth/getSession";
import { generateOAuthState } from "~/.server/auth/oauthState";
import { getWellKnownEndpoints } from "~/.server/auth/wellKnownEndpoints";
import { createLabel } from "~/.server/logging";
import { cytarioConfig } from "~/config";

export const meta: MetaFunction = () => {
  return [
    { title: "Cytario | Login" },
    {
      name: "description",
      content:
        "Log in to Cytario to access your secure workspace and manage your data.",
    },
  ];
};

const label = createLabel("login", "blue");

/**
 * OAuth 2.0 Authorization Code Flow - Login Initiator
 *
 * This route redirects users to Keycloak for authentication using the modern
 * Authorization Code Flow instead of the deprecated Resource Owner Password Credentials (ROPC).
 *
 * Benefits:
 * - Industry standard OAuth 2.0 flow (not deprecated)
 * - User credentials never touch this application
 * - Supports MFA, SSO, and social login
 * - Tokens remain server-side only (via callback handler)
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.info(`${label} Login initiated`);

  // Check if user is already authenticated
  const session = await getSession(request);
  const user = session.get("user");

  if (user) {
    console.info(`${label} User already authenticated, redirecting`);
    return redirect("/");
  }

  try {
    // Get the redirect parameter to return user to intended page after login
    const url = new URL(request.url);
    const redirectTo = url.searchParams.get("redirect");

    // Generate state parameter for CSRF protection and store redirect destination
    const state = await generateOAuthState(redirectTo || undefined);

    // Get Keycloak endpoints
    const wellKnownEndpoints = await getWellKnownEndpoints();

    // Build authorization URL
    const redirectUri = `${cytarioConfig.endpoints.webapp}/auth/callback`;
    const authUrl = new URL(wellKnownEndpoints.authorization_endpoint);
    authUrl.searchParams.set("client_id", cytarioConfig.auth.clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", cytarioConfig.auth.scopes.join(" "));
    authUrl.searchParams.set("state", state);

    console.info(`${label} Redirecting to Keycloak authorization endpoint`);

    // Redirect user to Keycloak login page
    return redirect(authUrl.toString());
  } catch (error) {
    console.error(`${label} Failed to initiate login:`, error);
    throw new Response("Failed to initiate login", { status: 500 });
  }
};

// This route only handles redirects, no UI needed
export default function LoginRoute() {
  return null;
}
