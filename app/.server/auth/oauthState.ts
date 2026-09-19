import { createHash, randomBytes } from "crypto";

import { redis } from "../db/redis";

const STATE_PREFIX = "oauth_state:";
const STATE_EXPIRY_SECONDS = 600; // 10 minutes

export interface OAuthState {
  state: string;
  redirectTo?: string;
  createdAt: number;
  codeVerifier: string;
  nonce: string;
}

export interface OAuthStateResult {
  state: string;
  codeChallenge: string;
  nonce: string;
}

export const generateCodeVerifier = (): string => randomBytes(32).toString("base64url");

export const generateCodeChallenge = (verifier: string): string =>
  createHash("sha256").update(verifier).digest("base64url");

export const generateNonce = (): string => randomBytes(16).toString("hex");

// Only allows relative paths — rejects absolute, protocol-relative, javascript:,
// data:, and backslash-bypass vectors (open-redirect guard).
export const validateRedirectTo = (redirectTo?: string): string => {
  if (!redirectTo) return "/";
  try {
    const base = "https://x";
    const parsed = new URL(redirectTo, base);
    if (parsed.origin !== base) return "/";
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return "/";
  }
};

export const generateOAuthState = async (redirectTo?: string): Promise<OAuthStateResult> => {
  const state = randomBytes(32).toString("hex");
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const nonce = generateNonce();

  const stateData: OAuthState = {
    state,
    redirectTo,
    createdAt: Date.now(),
    codeVerifier,
    nonce,
  };

  await redis.setex(`${STATE_PREFIX}${state}`, STATE_EXPIRY_SECONDS, JSON.stringify(stateData));

  return { state, codeChallenge, nonce };
};

// Atomic GETDEL makes the state single-use (requires Redis 6.2+ / Valkey).
export const validateOAuthState = async (state: string): Promise<OAuthState | null> => {
  const key = `${STATE_PREFIX}${state}`;
  const stateJson = await redis.getdel(key);

  if (!stateJson) {
    return null;
  }

  try {
    const stateData: OAuthState = JSON.parse(stateJson);
    return stateData;
  } catch (error) {
    console.error("Failed to parse OAuth state:", error);
    return null;
  }
};
