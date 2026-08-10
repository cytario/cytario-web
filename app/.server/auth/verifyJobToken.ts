import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import { getWellKnownEndpoints } from "./wellKnownEndpoints";
import { cytarioConfig } from "~/config";

let remoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

const getJwks = async () => {
  if (!remoteJwks) {
    const { jwks_uri } = await getWellKnownEndpoints();
    remoteJwks = createRemoteJWKSet(new URL(jwks_uri));
  }
  return remoteJwks;
};

/**
 * Verified payload of a job-scoped broker token (SRS-CY-41901). Carries the
 * nested `organization` claim and the `sub` of the submitting user; the host
 * derives the request's `HostRequestData` from these claims so the carve-out
 * dispatch path never depends on a browser session (SRS-CY-416102(b),
 * SDS-CY-080400).
 */
export interface VerifiedJobToken extends JWTPayload {
  sub: string;
}

/**
 * Verifies a job-scoped broker token's signature, issuer, and audience
 * (SRS-CY-416102(a), SRS-CY-41901). The audience is the job-broker client
 * (`KC_JOB_BROKER_CLIENT_ID`); unlike {@link verifyIdToken} the audience is
 * always validated, because the broker endpoint is a carve-out outside the
 * session gate and the token's audience is the only claim that ties it to
 * this endpoint. Returns the verified payload (typed to require `sub`) or
 * null on any verification failure.
 *
 * Server-only: lives under `.server/` so it never enters the client bundle.
 */
export const verifyJobToken = async (token: string): Promise<VerifiedJobToken | null> => {
  try {
    const { jobBrokerClientId } = cytarioConfig.auth;
    if (!jobBrokerClientId) return null;
    const jwks = await getJwks();
    const { issuer } = await getWellKnownEndpoints();
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: jobBrokerClientId,
      clockTolerance: 30,
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    return payload as VerifiedJobToken;
  } catch {
    return null;
  }
};
