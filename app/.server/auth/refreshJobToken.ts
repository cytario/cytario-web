import { getWellKnownEndpoints } from "./wellKnownEndpoints";
import { cytarioConfig } from "~/config";

/**
 * The result of redeeming an offline grant's refresh token at the identity
 * service. The `accessToken` is the fresh, unexpired JWT the broker verifies
 * and passes to STS as `WebIdentityToken`; `newRefreshToken` is the rotated
 * refresh token the broker returns to the container so its next mint
 * presents the current (rotated) token (SRS-CY-416102(a)).
 */
export interface RefreshedJobToken {
  accessToken: string;
  newRefreshToken: string;
}

/**
 * Redeems an offline grant's refresh token at the identity service's token
 * endpoint (SRS-CY-416102(a), SDS-CY-080400) to obtain a fresh, unexpired
 * access token for the broker's STS mint and the rotated refresh token to
 * return to the container.
 *
 * The job-broker client authenticates with its client credentials (the same
 * confidential client used for the original RFC 8693 token exchange,
 * SDS-CY-020105). The container never holds the `client_secret` — only the
 * broker does, which is why refresh happens host-side rather than in the
 * SDK.
 *
 * A non-2xx response (revoked session, expired past the realm's offline
 * max, or a replayed/rotated refresh token) throws — the broker maps that
 * to a 401 `GrantExpired` so the container stops retrying.
 */
export async function refreshJobToken(refreshToken: string): Promise<RefreshedJobToken> {
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
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: jobBrokerClientId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Job token refresh failed: ${response.status} - ${errorText || response.statusText}`,
    );
  }

  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
  };

  if (!json.access_token || !json.refresh_token) {
    throw new Error("Job token refresh returned an incomplete token response");
  }

  return { accessToken: json.access_token, newRefreshToken: json.refresh_token };
}
