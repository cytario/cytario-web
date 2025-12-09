import { randomBytes } from "crypto";

import { redis } from "../db/redis";

const STATE_PREFIX = "oauth_state:";
const STATE_EXPIRY_SECONDS = 600; // 10 minutes

export interface OAuthState {
  state: string;
  redirectTo?: string;
  createdAt: number;
}

/**
 * Generates a secure random state parameter for OAuth CSRF protection
 * and stores it in the cache store (Redis/Valkey) with a short expiry time.
 */
export const generateOAuthState = async (
  redirectTo?: string
): Promise<string> => {
  const state = randomBytes(32).toString("hex");
  const stateData: OAuthState = {
    state,
    redirectTo,
    createdAt: Date.now(),
  };

  await redis.setex(
    `${STATE_PREFIX}${state}`,
    STATE_EXPIRY_SECONDS,
    JSON.stringify(stateData)
  );

  return state;
};

/**
 * Validates and retrieves the OAuth state from the cache store (Redis/Valkey).
 * Returns the state data if valid, or null if invalid/expired.
 * The state is automatically deleted after retrieval to prevent reuse.
 */
export const validateOAuthState = async (
  state: string
): Promise<OAuthState | null> => {
  const key = `${STATE_PREFIX}${state}`;
  const stateJson = await redis.get(key);

  if (!stateJson) {
    return null;
  }

  // Delete the state immediately to prevent reuse (CSRF protection)
  await redis.del(key);

  try {
    const stateData: OAuthState = JSON.parse(stateJson);
    return stateData;
  } catch (error) {
    console.error("Failed to parse OAuth state:", error);
    return null;
  }
};
