import type { ActionFunctionArgs } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { storePendingSubmission } from "~/.server/auth/jobGrantStorage";
import { generateCodeChallenge, generateCodeVerifier } from "~/.server/auth/oauthState";
import { getWellKnownEndpoints } from "~/.server/auth/wellKnownEndpoints";
import { createLabel } from "~/.server/logging";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { cytarioConfig } from "~/config";

const label = createLabel("job-grant", "magenta");

export const middleware = [requestDurationMiddleware, authMiddleware];

/**
 * Initiates the Authorization Code + PKCE flow for the job grant
 * (SRS-CY-41901). The browser POSTs the plugin run payload here; the host
 * stores it in Redis (with a PKCE verifier), and returns the Keycloak
 * authorization URL. The browser redirects to Keycloak, which authenticates
 * via the existing SSO session and prompts offline_access consent. On
 * callback, the host retrieves the pending payload, exchanges the auth code
 * for the offline grant, and re-dispatches the payload to the plugin's
 * submit phase.
 */
export const action = async (args: ActionFunctionArgs): Promise<Response> => {
  const body = await args.request.text();
  if (!body) {
    return Response.json({ error: "Request body is required" }, { status: 400 });
  }

  const { jobBrokerClientId } = cytarioConfig.auth;
  if (!jobBrokerClientId) {
    return Response.json({ error: "Job broker client not configured" }, { status: 500 });
  }

  const { user } = args.context.get(authContext);
  if (!user?.organization) {
    return Response.json({ error: "Active organization required" }, { status: 403 });
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const { state, batchId } = await storePendingSubmission({
    pluginPath: "/api/plugin/run",
    requestBody: body,
    userId: user.sub,
    organization: user.organization,
    returnPath: "/plugin/jobs",
    codeVerifier,
  });

  const wellKnown = await getWellKnownEndpoints();
  const redirectUri = `${new URL(args.request.url).origin}/api/job-grant/callback`;
  const authUrl = new URL(wellKnown.authorization_endpoint);
  authUrl.searchParams.set("client_id", jobBrokerClientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid offline_access");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  console.info(`${label} Initiated job grant flow for batch ${batchId}`);
  return Response.json({ redirectUrl: authUrl.toString(), batchId });
};
