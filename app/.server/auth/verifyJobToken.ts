import type { JWTPayload } from "jose";

import { verifyToken } from "./jwtVerify";
import { cytarioConfig } from "~/config";

/**
 * Verified payload of a job-scoped broker token. Carries the nested
 * `organization` claim and the `sub` of the submitting user; the host derives
 * the request's `HostRequestData` from these claims so the carve-out dispatch
 * path never depends on a browser session.
 */
export interface VerifiedJobToken extends JWTPayload {
  sub: string;
}

/**
 * Verifies a job-scoped broker token's signature, issuer, and audience. The
 * audience is the job-broker client (`KC_JOB_BROKER_CLIENT_ID`); unlike
 * {@link verifyIdToken} the audience is always validated, because the broker
 * endpoint is a carve-out outside the session gate and the token's audience is
 * the only claim that ties it to this endpoint. Returns the verified payload
 * (typed to require `sub`) or null on any verification failure.
 */
export const verifyJobToken = async (token: string): Promise<VerifiedJobToken | null> => {
  const { jobBrokerClientId } = cytarioConfig.auth;
  if (!jobBrokerClientId) return null;
  const payload = await verifyToken(token, jobBrokerClientId);
  if (typeof payload?.sub !== "string" || payload.sub.length === 0) return null;
  return payload as VerifiedJobToken;
};
