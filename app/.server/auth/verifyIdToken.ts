import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import { getWellKnownEndpoints } from "./wellKnownEndpoints";

let remoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

const getJwks = async () => {
  if (!remoteJwks) {
    const { jwks_uri } = await getWellKnownEndpoints();
    remoteJwks = createRemoteJWKSet(new URL(jwks_uri));
  }
  return remoteJwks;
};

/**
 * Verifies an ID token's signature using the JWKS from the OIDC provider.
 * Validates issuer and clock tolerance. Returns the verified payload or null on failure.
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
  } catch {
    return null;
  }
};
