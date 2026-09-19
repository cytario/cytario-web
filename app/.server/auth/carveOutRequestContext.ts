import type { JWTPayload } from "jose";

import type { UserProfile } from "./getUserInfo";
import type { AuthTokens } from "./sessionStorage";
import type { HostRequestData } from "../hostRequestContext";
import type { VerifiedJobToken } from "./verifyJobToken";
import type { Identity } from "@cytario/plugin-api";

// A user may belong to multiple Keycloak organizations (multi-key claim); a
// legacy string claim (org mapper not firing on token refresh) is accepted
// with a warn log.
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

/** Sole claim key when unambiguous; `undefined` when absent or multi-org (caller must resolve or fail closed). */
export function readSoleOrganizationClaim(payload: JWTPayload): string | undefined {
  const keys = readOrganizationClaimKeys(payload);
  return keys.size === 1 ? [...keys][0] : undefined;
}

// Organization and user derive exclusively from verified claims and the
// caller-resolved organization — never caller-supplied body/query/header,
// never a browser session (the carve-out runs outside the session gate); a
// caller that cannot resolve the org passes `undefined` and org-requiring
// capabilities fail closed. The token rides as `idToken` so
// `assumeComputeRole` can present it as the STS `WebIdentityToken`.
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

// No org synthesized: the reconciler's cross-org scan does not pre-filter by
// org; the dispatcher verifies the shared secret before this is built.
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
