import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTPayload,
} from "jose";

import { getWellKnownEndpoints } from "./wellKnownEndpoints";

export class IdTokenVerificationError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean, cause?: unknown) {
    super(message, { cause });
    this.name = "IdTokenVerificationError";
    this.retryable = retryable;
  }
}

let remoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let lastJwksReset = 0;
const JWKS_RESET_COOLDOWN_MS = 30_000;

const getJwks = async () => {
  if (!remoteJwks) {
    const { jwks_uri } = await getWellKnownEndpoints();
    remoteJwks = createRemoteJWKSet(new URL(jwks_uri));
  }
  return remoteJwks;
};

/**
 * Resets the cached JWKS fetcher so the next request recreates it.
 * Rate-limited to once per 30 seconds to prevent amplification attacks
 * that could force repeated JWKS endpoint fetches.
 */
const resetJwks = () => {
  if (Date.now() - lastJwksReset > JWKS_RESET_COOLDOWN_MS) {
    remoteJwks = null;
    lastJwksReset = Date.now();
  }
};

/**
 * Verifies an ID token's signature using the JWKS from the OIDC provider.
 * Validates issuer and clock tolerance. Returns the verified payload or null
 * when the token itself is invalid (expired, bad signature, wrong issuer).
 *
 * Throws {@link IdTokenVerificationError} for transient infrastructure errors
 * (JWKS fetch timeout, network failure) so the caller can return 503 instead
 * of incorrectly treating it as an invalid token.
 *
 * Note: `audience` validation is omitted — Keycloak's ID token `aud` claim
 * behavior varies by client configuration. Add after confirming the actual
 * `aud` claim value in production tokens.
 */
export const verifyIdToken = async (
  token: string,
): Promise<JWTPayload | null> => {
  try {
    const jwks = await getJwks();
    const { issuer } = await getWellKnownEndpoints();
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      clockTolerance: 30,
    });
    return payload;
  } catch (error) {
    // JWKS timeout is transient — the OIDC provider may be temporarily unreachable
    if (error instanceof errors.JWKSTimeout) {
      resetJwks();
      throw new IdTokenVerificationError(
        "JWKS fetch timed out",
        true,
        error,
      );
    }

    // All other jose errors are token validation failures (expired, bad signature,
    // wrong issuer, invalid claims) — return null to trigger the refresh flow
    if (error instanceof errors.JOSEError) {
      return null;
    }

    // Non-jose errors (network failures from fetch inside createRemoteJWKSet,
    // DNS resolution errors, etc.) are transient infrastructure issues
    resetJwks();
    throw new IdTokenVerificationError(
      `JWKS verification infrastructure error: ${error instanceof Error ? error.message : "Unknown error"}`,
      true,
      error,
    );
  }
};
