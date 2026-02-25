import { randomUUID } from "crypto";

import { AuthTokens } from "./sessionStorage";
import { getWellKnownEndpoints } from "./wellKnownEndpoints";
import { redis } from "../db/redis";
import { cytarioConfig } from "~/config";

export interface AuthTokensResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  id_token: string;
  token_type: "Bearer";
  scope: string;
}

/**
 * Refreshes the access token using the provided refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<AuthTokens> {
  const wellKnownEndpoints = await getWellKnownEndpoints();

  const response = await fetch(wellKnownEndpoints.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cytarioConfig.auth.clientId,
      client_secret: cytarioConfig.auth.clientSecret,
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) throw new Error("Failed to refresh token");
  const { access_token, id_token, refresh_token } =
    (await response.json()) as AuthTokensResponse;

  const authTokens: AuthTokens = {
    accessToken: access_token,
    idToken: id_token,
    refreshToken: refresh_token,
  };

  return authTokens;
}

const LOCK_PREFIX = "refresh_lock:";
const LOCK_TTL_SECONDS = 15;
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 100;

/**
 * Lua script for atomic check-and-delete.
 * Only deletes the key if the value matches (prevents stale lock release).
 */
const RELEASE_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Refreshes access tokens with a distributed lock to prevent concurrent refresh
 * races during burst requests. Uses Redis NX + Lua atomic release.
 */
export async function refreshAccessTokenWithLock(
  sessionId: string,
  refreshToken: string,
): Promise<AuthTokens> {
  const lockKey = `${LOCK_PREFIX}${sessionId}`;
  const lockValue = randomUUID();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const acquired = await redis.set(
      lockKey,
      lockValue,
      "EX",
      LOCK_TTL_SECONDS,
      "NX",
    );

    if (acquired === "OK") {
      try {
        return await refreshAccessToken(refreshToken);
      } finally {
        await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue);
      }
    }

    await delay(RETRY_DELAY_MS);
  }

  throw new Error(
    `Failed to acquire refresh lock for session ${sessionId} after ${MAX_RETRIES} retries`,
  );
}
