import type { JWTPayload } from "jose";

import { verifyToken } from "./jwtVerify";
import { cytarioConfig } from "~/config";

/**
 * Verified payload of a cytario-CLI ID token. Carries the nested
 * `organization` claim and the `sub` of the signed-in user; the
 * my-connections endpoint derives the request's user and active
 * organization from these claims without any browser session.
 */
export interface VerifiedCliToken extends JWTPayload {
  sub: string;
}

/**
 * Verifies a cytario-CLI ID token's signature, issuer, and audience. The
 * audience is the CLI client (`CYTARIO_CLI_CLIENT_ID`) — the audience is
 * always validated because the endpoint is a carve-out outside the session
 * gate and the token's audience is the only claim that ties it to this
 * route. Returns the verified payload (typed to require `sub`) or null on
 * any verification failure.
 */
export const verifyCliToken = async (token: string): Promise<VerifiedCliToken | null> => {
  const { cliClientId } = cytarioConfig.auth;
  if (!cliClientId) return null;
  const payload = await verifyToken(token, cliClientId);
  if (typeof payload?.sub !== "string" || payload.sub.length === 0) return null;
  return payload as VerifiedCliToken;
};
