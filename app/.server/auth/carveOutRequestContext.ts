import type { JWTPayload } from "jose";

import type { UserProfile } from "./getUserInfo";
import type { AuthTokens } from "./sessionStorage";
import type { HostRequestData } from "../hostRequestContext";
import type { VerifiedJobToken } from "./verifyJobToken";
import type { Identity } from "@cytario/plugin-api";

/**
 * Reads the Keycloak nested `organization` claim (the same shape
 * {@link getUserInfo} parses for a session) and returns every organization
 * alias key it carries. A user who belongs to multiple Keycloak
 * organizations gets a multi-key claim; the single-alias case is the
 * single-entry set. A legacy string claim (the org mapper not firing on
 * token refresh) is accepted with a warn log. Returns an empty set when
 * the claim is absent or of an unexpected shape.
 */
export function readOrganizationClaimKeys(payload: JWTPayload): ReadonlySet<string> {
  const claim = payload.organization;
  if (!claim) return new Set<string>();
  if (typeof claim === "string") {
    console.warn(
      `[carve-out] organization claim is a string ("${claim}"), expected object form — ` +
        "the org mapper may not be firing on token refresh; using the string as fallback",
    );
    return new Set([claim]);
  }
  if (typeof claim === "object" && !Array.isArray(claim)) {
    return new Set(Object.keys(claim as Record<string, unknown>));
  }
  return new Set<string>();
}

/**
 * Resolves the single organization a token unambiguously asserts: the sole
 * key of the nested `organization` claim, or `undefined` when the claim is
 * absent or the user belongs to multiple organizations (the caller must
 * then resolve the org by another means or fail closed).
 */
export function readSoleOrganizationClaim(payload: JWTPayload): string | undefined {
  const keys = readOrganizationClaimKeys(payload);
  return keys.size === 1 ? [...keys][0] : undefined;
}

/**
 * Builds a {@link HostRequestData} for a carve-out dispatch path from the
 * job-scoped broker token's verified claims.
 *
 * Organization and submitting user are derived exclusively from verified
 * claims and the caller-resolved organization — never from a caller-supplied
 * body, query, or header, and never from a browser session (the carve-out
 * runs outside the session gate). The active organization is not parsed
 * from the token here: the caller resolves it (from the ledger row, or the
 * sole claim key when unambiguous) and passes it explicitly; a caller with
 * no way to resolve it passes `undefined` and host capabilities that
 * require an organization fail closed. `sub` is the submitting user. The
 * token itself is carried as the `idToken` so `assumeComputeRole` can present
 * it as the STS `WebIdentityToken` (the grant carries the AWS principal-tag
 * ORG claim required by the compute-role trust configuration).
 *
 * The synthetic {@link UserProfile} carries only the fields the host
 * capabilities read (`sub`, `organization`); the remaining profile fields are
 * not present on a job-token request and are left minimal — host capability
 * methods that touch them are not reachable from the broker carve-out.
 */
export function hostRequestDataFromJobToken(
  token: VerifiedJobToken,
  rawToken: string,
  organization: string | undefined,
): HostRequestData {
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
 * webhook-secret carve-out. No organization and no user is synthesized — the
 * reconciler's cross-org scan ({@link JobLedger.listAll}) does not pre-filter
 * by org, and the per-org compute role is minted by passing the row's
 * organization to `assumeComputeRole` explicitly. The dispatcher verifies the
 * shared secret before this context is built.
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
