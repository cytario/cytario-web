import { getWellKnownEndpoints } from "./wellKnownEndpoints";
import type { TokenGrant } from "@cytario/plugin-api";
import { cytarioConfig } from "~/config";

interface AuthCodeTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  session_state?: string;
}

/**
 * Exchanges an authorization code + PKCE verifier for an offline-capable
 * job grant on the job-broker client (SRS-CY-41901). The Authorization Code
 * + PKCE flow creates a real offline session at Keycloak; the returned
 * refresh token survives the user's interactive session and is redeemable
 * by the credential broker on every call.
 *
 * The job-broker client authenticates with its client credentials (Basic
 * auth); the PKCE verifier proves the code was issued to the same party
 * that initiated the flow.
 */
export async function exchangeAuthCodeForJobGrant(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<TokenGrant> {
  const { jobBrokerClientId, jobBrokerClientSecret } = cytarioConfig.auth;

  if (!jobBrokerClientId || !jobBrokerClientSecret) {
    throw new Error(
      "Job broker client is not configured — set KC_JOB_BROKER_CLIENT_ID and KC_JOB_BROKER_CLIENT_SECRET",
    );
  }

  const wellKnown = await getWellKnownEndpoints();

  const response = await fetch(wellKnown.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${jobBrokerClientId}:${jobBrokerClientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: jobBrokerClientId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Job grant auth code exchange failed: ${response.status} - ${errorText}`);
  }

  const json = (await response.json()) as AuthCodeTokenResponse;

  if (!json.refresh_token) {
    throw new Error("Job grant auth code exchange returned no refresh_token");
  }

  if (!json.session_state) {
    throw new Error("Job grant auth code exchange returned no session_state (offline session id)");
  }

  return {
    token: json.refresh_token,
    expiresAt: new Date(Date.now() + (json.refresh_expires_in ?? json.expires_in) * 1000),
    offlineSessionId: json.session_state,
  };
}
