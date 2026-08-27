import { AuthTokens, SessionData } from "./sessionStorage";
import { getWellKnownEndpoints } from "./wellKnownEndpoints";
import { redis } from "../db/redis";
import { withRedisLock } from "../db/redisLock";
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
export async function refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
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
  const { access_token, id_token, refresh_token } = (await response.json()) as AuthTokensResponse;

  const authTokens: AuthTokens = {
    accessToken: access_token,
    idToken: id_token,
    refreshToken: refresh_token,
  };

  return authTokens;
}

const LOCK_PREFIX = "refresh_lock:";

/**
 * Reads the current session auth tokens directly from Redis,
 * bypassing the in-memory LRU cache to get the freshest data.
 */
async function readSessionTokensFromStore(sessionId: string): Promise<AuthTokens | null> {
  const data = await redis.hget(sessionId, "data");
  if (!data) return null;

  const parsed = JSON.parse(data) as Partial<SessionData>;
  return parsed.authTokens ?? null;
}

/**
 * Writes the refreshed auth tokens directly to Redis, bypassing the
 * in-memory LRU cache. Called inside the lock so concurrent waiters
 * see the new (rotated) refresh token before the lock is released —
 * without this, a concurrent request that acquires the lock next
 * would read the old (now-revoked) refresh token from Redis and
 * fail the refresh, logging the user out.
 */
async function writeSessionTokensToStore(sessionId: string, tokens: AuthTokens): Promise<void> {
  const data = await redis.hget(sessionId, "data");
  if (!data) return;

  const parsed = JSON.parse(data) as Partial<SessionData>;
  parsed.authTokens = tokens;
  await redis.hset(sessionId, "data", JSON.stringify(parsed));
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
  return withRedisLock(`${LOCK_PREFIX}${sessionId}`, async () => {
    // Re-read session from Redis to check if tokens were already refreshed
    // by a previous lock holder (Keycloak rotates refresh tokens, so the
    // old token would be revoked). If the stored refresh token differs
    // from the one passed in, the already-refreshed tokens are returned
    // without hitting Keycloak.
    const currentTokens = await readSessionTokensFromStore(sessionId);

    if (currentTokens && currentTokens.refreshToken !== refreshToken) {
      return currentTokens;
    }

    const newTokens = await refreshAccessToken(refreshToken);

    // Persist the new tokens to Redis BEFORE releasing the lock so
    // the next lock holder sees the rotated refresh token and skips
    // the Keycloak call. Without this, there is a window between lock
    // release and the middleware's commitSession where a concurrent
    // request reads the old (revoked) refresh token, calls Keycloak,
    // gets rejected, and logs the user out.
    await writeSessionTokensToStore(sessionId, newTokens);

    return newTokens;
  });
}
