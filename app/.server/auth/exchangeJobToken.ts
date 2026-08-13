import { hostRequestStorage } from "../hostRequestContext";
import { getWellKnownEndpoints } from "./wellKnownEndpoints";
import type { TokenGrant } from "@cytario/plugin-api";
import { cytarioConfig } from "~/config";

/** RFC 8693 token-exchange grant type. */
const TOKEN_EXCHANGE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:token-exchange";

/** The subject token type for an OAuth 2.0 access token. */
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";

function requireRequestData() {
  const data = hostRequestStorage.getStore();
  if (!data) {
    throw new Error(
      "Host capabilities called outside a request context — ensure the request pipeline sets up hostRequestStorage before plugin loaders/actions run",
    );
  }
  return data;
}

/**
 * Performs the offline-capable job token grant via RFC 8693 token exchange
 * (SDS-CY-010098, SRS-CY-41901, SDS-CY-020105).
 *
 * Exchanges the user's session access token for an offline-capable grant
 * with the job-broker client as the audience. The grant carries the nested
 * `organization` claim and the `ORG` principal-tag claim (reusing the
 * existing protocol mappers) and can be passed to a submitted job so it can
 * call the credential-broker endpoint to obtain short-lived storage
 * credentials without a browser session (SDS-CY-080400).
 *
 * Returns the grant's **refresh token**, not the access token. The access
 * token issued by the exchange has a short `exp` (the client's access-token
 * lifespan, typically minutes), but a job may run for hours. The refresh
 * token is valid until the realm's maximum offline-session validity
 * (SRS-CY-416104). The broker redeems (refreshes) the refresh token at the
 * identity service on every call (SRS-CY-416102(a), SDS-CY-080400) to obtain
 * a fresh, unexpired access token for STS — passing the access token directly
 * to STS would fail for any job whose startup outlives the token's `exp`.
 *
 * The offline-session id from the exchange response is returned alongside
 * the token so the Job Adapter can record it in the running-jobs ledger
 * (SDS-CY-080900).
 */
export async function exchangeJobToken(): Promise<TokenGrant> {
  const { authTokens } = requireRequestData();
  const { jobBrokerClientId, jobBrokerClientSecret } = cytarioConfig.auth;

  if (!jobBrokerClientId || !jobBrokerClientSecret) {
    throw new Error(
      "Job broker client is not configured — set KC_JOB_BROKER_CLIENT_ID and KC_JOB_BROKER_CLIENT_SECRET",
    );
  }

  const wellKnown = await getWellKnownEndpoints();

  // Authenticate the exchange as job-broker (requester == audience) — a
  // first-party exchange, the permissive case in Keycloak's
  // audience-availability gate, mirroring the admin-portal SA exchange
  // (SDS-CY-020105). A third-party exchange (a different client as
  // requester, job-broker as audience) is rejected with "Requested
  // audience not available". The audience mapper on the cytario-web
  // client injects job-broker into the user token's aud so the
  // requested audience resolves.
  const response = await fetch(wellKnown.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${jobBrokerClientId}:${jobBrokerClientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
      subject_token: authTokens.accessToken,
      subject_token_type: ACCESS_TOKEN_TYPE,
      audience: jobBrokerClientId,
      scope: "openid offline_access",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
  }

  const json = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    refresh_expires_in?: number;
    session_state?: string;
  };

  // The grant is the refresh token, not the access token — the access
  // token's short `exp` would expire before a long job calls the broker.
  // The broker refreshes this grant on every call.
  if (!json.refresh_token) {
    throw new Error("Token exchange returned no refresh_token (offline_access scope not granted)");
  }

  if (!json.session_state) {
    throw new Error("Token exchange returned no session_state (offline-session id)");
  }

  return {
    token: json.refresh_token,
    expiresAt: new Date(Date.now() + (json.refresh_expires_in ?? json.expires_in) * 1000),
    offlineSessionId: json.session_state,
  };
}
