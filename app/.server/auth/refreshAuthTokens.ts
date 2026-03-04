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

export class TokenRefreshError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "TokenRefreshError";
    this.retryable = retryable;
  }
}

/**
 * Refreshes the access token using the provided refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<AuthTokens> {
  const wellKnownEndpoints = await getWellKnownEndpoints();

  let response: Response;
  try {
    response = await fetch(wellKnownEndpoints.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: cytarioConfig.auth.clientId,
        client_secret: cytarioConfig.auth.clientSecret,
        refresh_token: refreshToken,
      }),
    });
  } catch (error) {
    throw new TokenRefreshError(
      `Failed to refresh token: ${error instanceof Error ? error.message : "Network error"}`,
      true,
    );
  }
  if (!response.ok) {
    const retryable = response.status >= 500 || response.status === 429;
    throw new TokenRefreshError(
      `Failed to refresh token (HTTP ${response.status})`,
      retryable,
    );
  }
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
const REFRESH_MAX_RETRIES = 3;
const REFRESH_BASE_DELAY_MS = 200;

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
 * Reads the current session data directly from Redis,
 * bypassing the in-memory LRU cache to get the freshest data.
 */
async function readSessionDataFromStore(
  sessionId: string,
): Promise<Partial<SessionData> | null> {
  const data = await redis.hget(sessionId, "data");
  if (!data) return null;

  return JSON.parse(data) as Partial<SessionData>;
}

/**
 * Writes updated auth tokens into the existing session data in Redis.
 * Accepts the already-read session data to avoid a redundant Redis read
 * (the caller reads it for rotation detection before calling this).
 */
async function writeSessionTokensToStore(
  sessionId: string,
  authTokens: AuthTokens,
  existingData: Partial<SessionData> | null,
): Promise<void> {
  const updated = { ...existingData, authTokens };
  await redis.hset(sessionId, "data", JSON.stringify(updated));
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
        const currentData = await readSessionDataFromStore(sessionId);
        const currentTokens = currentData?.authTokens ?? null;

        if (
          currentTokens &&
          currentTokens.refreshToken !== refreshToken
        ) {
          return currentTokens;
        }

        // Retry transient Keycloak errors with exponential backoff,
        // staying inside the lock to avoid release/re-acquire overhead.
        for (let retry = 0; retry < REFRESH_MAX_RETRIES; retry++) {
          try {
            const newTokens = await refreshAccessToken(refreshToken);

            // Write refreshed tokens to Redis while still holding the lock,
            // so concurrent requests waiting for the lock will read the new tokens
            // and skip the Keycloak call (rotation detection).
            await writeSessionTokensToStore(sessionId, newTokens, currentData);

            return newTokens;
          } catch (error) {
            const isLastAttempt = retry === REFRESH_MAX_RETRIES - 1;
            if (
              !(error instanceof TokenRefreshError) ||
              !error.retryable ||
              isLastAttempt
            ) {
              throw error;
            }
            await delay(REFRESH_BASE_DELAY_MS * 2 ** retry);
          }
        }

        // Unreachable: loop always returns or throws on last iteration
        throw new TokenRefreshError(
          "Exhausted all Keycloak retry attempts",
          true,
        );
      } finally {
        await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue);
      }
    }

    await delay(RETRY_DELAY_MS);
  }

  throw new TokenRefreshError(
    "Failed to acquire refresh lock after maximum retries",
    true,
  );
}
