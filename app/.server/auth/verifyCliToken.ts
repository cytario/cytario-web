import type { JWTPayload } from "jose";

import { verifyToken } from "./jwtVerify";
import { cytarioConfig } from "~/config";

export interface VerifiedCliToken extends JWTPayload {
  sub: string;
}

// The audience is always validated because the endpoint is a carve-out
// outside the session gate and the token's audience is the only claim that
// ties it to this route.
export const verifyCliToken = async (token: string): Promise<VerifiedCliToken | null> => {
  const { cliClientId } = cytarioConfig.auth;
  if (!cliClientId) return null;
  const payload = await verifyToken(token, cliClientId);
  if (typeof payload?.sub !== "string" || payload.sub.length === 0) return null;
  return payload as VerifiedCliToken;
};
