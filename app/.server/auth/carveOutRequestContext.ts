import type { JWTPayload } from "jose";

import type { UserProfile } from "./getUserInfo";
import type { AuthTokens } from "./sessionStorage";
import type { HostRequestData } from "../hostRequestContext";
import type { VerifiedJobToken } from "./verifyJobToken";
import type { Identity } from "@cytario/plugin-api";

/**
 * Builds a {@link HostRequestData} for a carve-out dispatch path from the
 * job-scoped broker token's verified claims (SRS-CY-416102(b),
 * SDS-CY-080400, SRS-CY-41901).
 *
 * Organization and submitting user are derived exclusively from the token's
 * own claims — never from a caller-supplied body, query, or header, and never
 * from a browser session (the carve-out runs outside the session gate,
 * SDS-CY-010095). The token's nested `organization` claim is the single
 * Keycloak organization alias under which the job was submitted; `sub` is the
 * submitting user. The token itself is carried as the `idToken` so
 * `assumeComputeRole` can present it as the STS `WebIdentityToken` (the grant
 * carries the AWS principal-tag ORG claim required by the compute-role trust
 * configuration, SRS-CY-41901/SRS-CY-43105).
 *
 * The synthetic {@link UserProfile} carries only the fields the host
 * capabilities read (`sub`, `organization`); the remaining profile fields are
 * not present on a job-token request and are left minimal — host capability
 * methods that touch them are not reachable from the broker carve-out.
 */
export function hostRequestDataFromJobToken(
  token: VerifiedJobToken,
  rawToken: string,
): HostRequestData {
  const organization = readOrganizationClaim(token);
  const user: UserProfile = {
    sub: token.sub,
    email: "",
    email_verified: false,
    name: "",
    preferred_username: "",
    given_name: "",
    family_name: "",
    policy: [],
    organization,
    organizationAttributes: Object.freeze({}),
    groups: [],
    adminScopes: [],
  };
  const identity: Identity = Object.freeze({
    sub: token.sub,
    organization,
    organizationAttributes: Object.freeze({}),
    groups: [],
    adminScopes: [],
  });
  const authTokens: AuthTokens = {
    accessToken: rawToken,
    refreshToken: "",
    idToken: rawToken,
  };
  return {
    user,
    identity,
    authTokens,
    sessionId: `job-token:${token.sub}`,
  };
}

/**
 * Builds an org-agnostic {@link HostRequestData} for a deployment-secret /
 * webhook-secret carve-out (SDS-CY-010095). No organization and no user is
 * synthesized — the reconciler's cross-org scan ({@link JobLedger.listAll},
 * SRS-CY-416106) does not pre-filter by org, and the per-org compute role is
 * minted by passing the row's organization to `assumeComputeRole` explicitly.
 * The deployment-secret constant-time compare is a separate, not-yet-
 * implemented host obligation; this context only lets the dispatched handler
 * call host capabilities without a session.
 */
export function orgAgnosticHostRequestData(): HostRequestData {
  const user: UserProfile = {
    sub: "",
    email: "",
    email_verified: false,
    name: "",
    preferred_username: "",
    given_name: "",
    family_name: "",
    policy: [],
    organization: undefined,
    organizationAttributes: Object.freeze({}),
    groups: [],
    adminScopes: [],
  };
  const authTokens: AuthTokens = {
    accessToken: "",
    refreshToken: "",
    idToken: "",
  };
  return {
    user,
    identity: undefined,
    authTokens,
    sessionId: "carve-out:org-agnostic",
  };
}

/**
 * Reads the Keycloak nested `organization` claim (the single alias key, the
 * same shape {@link getUserInfo} parses for a session) and returns it, or
 * `undefined` when the claim is absent. The job-scoped token carries this
 * claim per SRS-CY-41901.
 */
function readOrganizationClaim(payload: JWTPayload): string | undefined {
  const claim = payload.organization;
  if (!claim || typeof claim !== "object") return undefined;
  const keys = Object.keys(claim as Record<string, unknown>);
  return keys.length === 1 ? keys[0] : undefined;
}
