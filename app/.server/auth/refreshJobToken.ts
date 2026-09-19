import { getWellKnownEndpoints } from "./wellKnownEndpoints";
import { cytarioConfig } from "~/config";

export interface RefreshedJobToken {
  accessToken: string;
  newRefreshToken: string;
}

// The container never holds the `client_secret` — only the broker does, which
// is why refresh happens host-side. A non-2xx response throws so the broker
// can map it to a 401 `GrantExpired` and the container stops retrying.
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
