import { H1 } from "@cytario/design";
import {
  data,
  LoaderFunctionArgs,
  MetaFunction,
  redirect,
  useLoaderData,
} from "react-router";

import { getSession } from "~/.server/auth/getSession";
import {
  generateOAuthState,
  validateRedirectTo,
} from "~/.server/auth/oauthState";
import { getWellKnownEndpoints } from "~/.server/auth/wellKnownEndpoints";
import { createLabel } from "~/.server/logging";
import { Section } from "~/components/Container";
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
 * True if the request's Referer is this app's own /auth/callback.
 * Used as a belt-and-braces loop breaker: if a callback failure ever leaks
 * back into /login, we refuse to restart OIDC rather than bouncing through
 * a live Keycloak SSO session indefinitely.
 */
const cameFromCallback = (request: Request): boolean => {
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    const refererUrl = new URL(referer);
    const webappUrl = new URL(cytarioConfig.endpoints.webapp);
    return (
      refererUrl.origin === webappUrl.origin &&
      refererUrl.pathname === "/auth/callback"
    );
  } catch {
    return false;
  }
};

/**
 * OAuth 2.0 Authorization Code Flow - Login Initiator
 *
 * This route redirects users to Keycloak for authentication using the modern
 * Authorization Code Flow with PKCE instead of the deprecated Resource Owner
 * Password Credentials (ROPC).
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

  // Refuse to restart OIDC if we just bounced out of a failed callback.
  // Keycloak's SSO session would silently hand us a fresh code, creating a
  // tight redirect loop the browser can only escape via ERR_TOO_MANY_REDIRECTS.
  if (cameFromCallback(request)) {
    console.error(`${label} Refusing to restart OIDC flow from /auth/callback referer`);
    return data(
      {
        error:
          "Sign-in could not be completed. Please start a new sign-in attempt.",
      },
      { status: 400 },
    );
  }

  try {
    // Get the redirect parameter to return user to intended page after login
    const url = new URL(request.url);
    const redirectTo = url.searchParams.get("redirect");

    // Validate redirect at ingress to prevent open redirect
    const safeRedirectTo = validateRedirectTo(redirectTo || undefined);

    // Generate state, PKCE, and nonce for CSRF/replay protection
    const { state, codeChallenge, nonce } = await generateOAuthState(
      safeRedirectTo === "/" ? undefined : safeRedirectTo,
    );

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
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("nonce", nonce);

    console.info(`${label} Redirecting to Keycloak authorization endpoint`);

    // Redirect user to Keycloak login page
    return redirect(authUrl.toString());
  } catch (error) {
    console.error(`${label} Failed to initiate login:`, error);
    throw new Response(
      "Unable to connect to authentication service. Please try again later.",
      { status: 502 },
    );
  }
};

export default function LoginRoute() {
  const loaderData = useLoaderData<typeof loader>();

  if (loaderData && "error" in loaderData) {
    return (
      <Section>
        <div className="container mx-auto px-4 max-w-lg" role="alert">
          <H1>Sign-in failed</H1>
          <p className="mt-4 text-slate-700">{loaderData.error}</p>
          <a
            href="/"
            className="text-cytario-purple-500 underline mt-6 inline-block"
          >
            Back to home
          </a>
        </div>
      </Section>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen">
      <p role="status" className="text-slate-500">Redirecting to login...</p>
    </div>
  );
}
