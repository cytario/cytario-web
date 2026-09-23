import { getWellKnownEndpoints } from "./wellKnownEndpoints";
import { cytarioConfig } from "~/config";

/**
 * The identity service answered and refused the refresh. That is the only
 * signal that the batch's grant is genuinely gone; every other failure on this
 * path — an unreachable endpoint, a bad request shape, a timeout — is a
 * condition of this deployment, not a verdict on the authorization.
 */
export class JobGrantRefusedError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(`Job token refresh refused: ${status} - ${detail}`);
    this.name = "JobGrantRefusedError";
    this.status = status;
  }
}

export interface RefreshedJobToken {
  accessToken: string;
  newRefreshToken: string;
  /** Access-token lifespan the identity service reported, clamped to the realm's. */
  expiresInSeconds: number;
}

// A fallback for an identity service that omits `expires_in`; the realm's
// access-token lifespan is the real bound either way.
const DEFAULT_ACCESS_TOKEN_LIFESPAN_SECONDS = 300;

// The container never holds the batch's refresh token — only the broker does
// (and the host holds the client_secret), which is why refresh happens
// server-side. A non-2xx response throws so the broker can map it to a 403/401
// and the container stops retrying.
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
    // A 4xx is the identity service judging the grant; a 5xx is it failing.
    if (response.status >= 400 && response.status < 500) {
      throw new JobGrantRefusedError(response.status, errorText || response.statusText);
    }
    throw new Error(
      `Job token refresh failed: ${response.status} - ${errorText || response.statusText}`,
    );
  }

  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!json.access_token || !json.refresh_token) {
    throw new Error("Job token refresh returned an incomplete token response");
  }

  return {
    accessToken: json.access_token,
    newRefreshToken: json.refresh_token,
    expiresInSeconds:
      typeof json.expires_in === "number" && json.expires_in > 0
        ? json.expires_in
        : DEFAULT_ACCESS_TOKEN_LIFESPAN_SECONDS,
  };
}
