import type { JWTPayload } from "jose";

import { verifyToken } from "./jwtVerify";
import { cytarioConfig } from "~/config";

export interface VerifiedJobToken extends JWTPayload {
  sub: string;
}

// The audience is always validated, because the broker endpoint is a
// carve-out outside the session gate and the token's audience is the only
// claim that ties it to this endpoint.
export const verifyJobToken = async (token: string): Promise<VerifiedJobToken | null> => {
  const { jobBrokerClientId } = cytarioConfig.auth;
  if (!jobBrokerClientId) return null;
  const payload = await verifyToken(token, jobBrokerClientId);
  if (typeof payload?.sub !== "string" || payload.sub.length === 0) return null;
  return payload as VerifiedJobToken;
};
