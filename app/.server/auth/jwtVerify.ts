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
 * Verifies a JWT's signature and issuer against the OIDC provider's JWKS,
 * with a 30-second clock tolerance. When `audience` is supplied it is
 * validated; otherwise the audience claim is not checked.
 */
export const verifyToken = async (token: string, audience?: string): Promise<JWTPayload | null> => {
  try {
    const jwks = await getJwks();
    const { issuer } = await getWellKnownEndpoints();
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      clockTolerance: 30,
      ...(audience ? { audience } : {}),
    });
    return payload;
  } catch {
    return null;
  }
};
