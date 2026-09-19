import type { JWTPayload } from "jose";

import { verifyToken } from "./jwtVerify";

// Audience validation is omitted — Keycloak's ID token `aud` claim behavior
// varies by client configuration.
export const verifyIdToken = async (token: string): Promise<JWTPayload | null> =>
  verifyToken(token);
