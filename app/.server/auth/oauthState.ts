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

/**
 * Generates a PKCE code verifier (RFC 7636 §4.1).
 * 43-char base64url string from 32 random bytes.
 */
export const generateCodeVerifier = (): string => randomBytes(32).toString("base64url");

/**
 * Generates a PKCE code challenge (S256) from a code verifier (RFC 7636 §4.2).
 */
export const generateCodeChallenge = (verifier: string): string =>
  createHash("sha256").update(verifier).digest("base64url");

/**
 * Generates a random nonce for OIDC ID token validation.
 */
export const generateNonce = (): string => randomBytes(16).toString("hex");

const SINGLE_FETCH_DATA_SUFFIX = ".data";
const SINGLE_FETCH_QUERY_PARAMS = ["_routes", "_data"];

/**
 * Strips React Router v8 single-fetch artifacts — the `.data` pathname suffix
 * and `_routes`/`_data` query params — from a parsed URL. During keep-alive
 * revalidation, `request.url` carries these internal markers; leaking them
 * into the login `redirect=` param causes the browser to document-navigate to
 * a turbo-stream endpoint after the OAuth callback, rendering the raw
 * `text/x-script` payload as plain text.
 */
export const stripSingleFetchArtifacts = (url: URL): string => {
  let pathname = url.pathname;
  if (pathname.endsWith(SINGLE_FETCH_DATA_SUFFIX)) {
    pathname = pathname.slice(0, -SINGLE_FETCH_DATA_SUFFIX.length);
  }
  const searchParams = new URLSearchParams(url.searchParams);
  for (const param of SINGLE_FETCH_QUERY_PARAMS) {
    searchParams.delete(param);
  }
  const search = searchParams.toString();
  return pathname + (search ? `?${search}` : "") + url.hash;
};

/**
 * Validates a redirect path to prevent open redirects.
 * Only allows relative paths — rejects absolute URLs, protocol-relative URLs,
 * javascript: URIs, data: URIs, and backslash bypass vectors. Also strips
 * React Router v8 single-fetch artifacts (`.data` suffix, `_routes`/`_data`
 * query params) so an internal data-request URL can never leak into a
 * post-login document navigation.
 */
export const validateRedirectTo = (redirectTo?: string): string => {
  if (!redirectTo) return "/";
  try {
    const base = "https://x";
    const parsed = new URL(redirectTo, base);
    if (parsed.origin !== base) return "/";
    return stripSingleFetchArtifacts(parsed);
  } catch {
    return "/";
  }
};

/**
 * Generates a secure random state parameter for OAuth CSRF protection
 * and stores it in the cache store (Redis/Valkey) with a short expiry time.
 * Returns state, codeChallenge, and nonce for the authorization URL.
 */
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

/**
 * Validates and retrieves the OAuth state from the cache store (Redis/Valkey).
 * Returns the state data if valid, or null if invalid/expired.
 * Uses atomic GETDEL to prevent reuse (requires Redis 6.2+ / Valkey).
 */
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
