import type { UserProfile } from "./getUserInfo";
import type { AuthTokens } from "./sessionStorage";
import type { HostRequestData } from "../hostRequestContext";
import type { ResolvedJobBinding } from "./resolveJobBinding";
import type { Identity } from "@cytario/plugin-api";

// Organization and user derive exclusively from the ledger row a presented job
// token resolved to — never caller-supplied body/query/header, never a browser
// session (the carve-out runs outside the session gate). A caller whose token
// resolves to no row fails closed before this is built.
export function jobTokenHostRequestData(binding: ResolvedJobBinding): HostRequestData {
  const user: UserProfile = {
    sub: binding.owner,
    email: "",
    email_verified: false,
    name: "",
    preferred_username: "",
    given_name: "",
    family_name: "",
    policy: [],
    organization: binding.organization,
    organizationAttributes: Object.freeze({}),
    groups: [],
    adminScopes: [],
  };
  const identity: Identity = Object.freeze({
    sub: binding.owner,
    organization: binding.organization,
    organizationAttributes: Object.freeze({}),
    groups: [],
    adminScopes: [],
  });
  const authTokens: AuthTokens = {
    accessToken: "",
    refreshToken: "",
    idToken: "",
  };
  return {
    user,
    identity,
    authTokens,
    sessionId: `job-token:${binding.jobId}`,
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
