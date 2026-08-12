import type { JWTPayload } from "jose";

import { verifyToken } from "./jwtVerify";

/**
 * Verifies an ID token's signature using the JWKS from the OIDC provider.
 * Validates issuer and clock tolerance. Returns the verified payload or null
 * on failure. Audience validation is omitted — Keycloak's ID token `aud`
 * claim behavior varies by client configuration.
 */
export const verifyIdToken = async (token: string): Promise<JWTPayload | null> =>
  verifyToken(token);
