import { randomUUID } from "crypto";

import { AuthTokens, SessionData } from "./sessionStorage";
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
 * Reads the current session auth tokens directly from Redis,
 * bypassing the in-memory LRU cache to get the freshest data.
 */
async function readSessionTokensFromStore(
  sessionId: string,
): Promise<AuthTokens | null> {
  const data = await redis.hget(sessionId, "data");
  if (!data) return null;

  const parsed = JSON.parse(data) as Partial<SessionData>;
  return parsed.authTokens ?? null;
}

/**
 * Refreshes access tokens with a distributed lock to prevent concurrent refresh
 * races during burst requests. Uses Redis NX + Lua atomic release.
 *
 * After acquiring the lock, re-reads the session from Redis to detect if another
 * request already completed the refresh (Keycloak rotates refresh tokens, so the
 * old token would be revoked). If the stored refresh token differs from the one
 * passed in, the already-refreshed tokens are returned without hitting Keycloak.
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
        // Re-read session from Redis to check if tokens were already refreshed
        // by a previous lock holder (handles refresh token rotation)
        const currentTokens = await readSessionTokensFromStore(sessionId);

        if (
          currentTokens &&
          currentTokens.refreshToken !== refreshToken
        ) {
          return currentTokens;
        }

        return await refreshAccessToken(refreshToken);
      } finally {
        await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue);
      }
    }

    await delay(RETRY_DELAY_MS);
  }

  throw new Error("Failed to acquire refresh lock after maximum retries");
}
