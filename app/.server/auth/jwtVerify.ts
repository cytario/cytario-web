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
