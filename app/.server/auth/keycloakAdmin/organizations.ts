import {
  adminFetch,
  adminFetchAll,
  adminFormMutate,
  adminMutate,
  type KeycloakGroup,
  type KeycloakUser,
} from "./client";
import { cytarioConfig } from "~/config";

export interface KeycloakOrganization {
  id: string;
  name: string;
  alias: string;
  description?: string;
  domains?: { name: string; verified?: boolean }[];
}

export async function findOrganizationByAlias(
  alias: string,
): Promise<KeycloakOrganization | undefined> {
  // KC 26.6's `/organizations?search=…` filters on `name` (and `domains`),
  // never on `alias` — when the alias differs from the name, that endpoint
  // returns an empty set even with `exact=true`. Page through every org and
  // filter client-side instead.
  const orgs = await adminFetchAll<KeycloakOrganization>((params) => `/organizations?${params}`);
  return orgs.find((o) => o.alias === alias);
}

export async function getOrganizationMembers(orgId: string): Promise<KeycloakUser[]> {
  return adminFetchAll<KeycloakUser>((params) => `/organizations/${orgId}/members?${params}`);
}

export async function createOrganizationSubgroup(
  orgId: string,
  parentGroupId: string | undefined,
  name: string,
): Promise<Response> {
  const path = parentGroupId
    ? `/organizations/${orgId}/groups/${parentGroupId}/children`
    : `/organizations/${orgId}/groups`;
  return adminMutate("POST", path, { name });
}

export async function findOrganizationGroupByPath(
  orgId: string,
  path: string,
): Promise<KeycloakGroup | undefined> {
  const normalised = path.startsWith("/") ? path : `/${path}`;
  try {
    return await adminFetch<KeycloakGroup>(
      `/organizations/${orgId}/groups/group-by-path${normalised}`,
    );
  } catch {
    return undefined;
  }
}

export async function deleteOrganizationGroup(orgId: string, groupId: string): Promise<Response> {
  return adminMutate("DELETE", `/organizations/${orgId}/groups/${groupId}`);
}

export async function addUserToOrganizationGroup(
  orgId: string,
  groupId: string,
  userId: string,
): Promise<Response> {
  return adminMutate("PUT", `/organizations/${orgId}/groups/${groupId}/members/${userId}`);
}

export async function removeUserFromOrganizationGroup(
  orgId: string,
  groupId: string,
  userId: string,
): Promise<Response> {
  return adminMutate("DELETE", `/organizations/${orgId}/groups/${groupId}/members/${userId}`);
}

export async function getOrganizationGroupMembers(
  orgId: string,
  groupId: string,
): Promise<KeycloakUser[]> {
  return adminFetchAll<KeycloakUser>(
    (params) => `/organizations/${orgId}/groups/${groupId}/members?${params}`,
  );
}

/** KC defaults `max=10` on the children endpoint, so pagination is mandatory. */
export async function listOrganizationGroups(
  orgId: string,
  groupId?: string,
): Promise<KeycloakGroup[]> {
  const path = groupId
    ? `/organizations/${orgId}/groups/${groupId}/children`
    : `/organizations/${orgId}/groups`;
  return adminFetchAll<KeycloakGroup>((params) => `${path}?${params}`);
}

// KC returns 409 both for "pending invitation already exists" and "user
// already a member" — both benign; the action layer classifies them as
// warnings rather than errors.
export async function inviteOrganizationUser(orgId: string, email: string): Promise<Response> {
  const body = new URLSearchParams();
  body.set("email", email);
  // The invitation link targets the account-console client. Sending
  // client_id=cytario-web made KC 26.8 build the link without redirect_uri,
  // which the authorization endpoint then rejects for any client with more
  // than one valid redirect URI (dev's localhost dev URL) — "Invalid
  // parameter: redirect_uri". account-console carries a single URI, so KC's
  // single-URI fallback resolves; the post-acceptance landing comes from the
  // organization's redirectUrl converged below instead.
  return adminFormMutate("POST", `/organizations/${orgId}/members/invite-user`, body);
}

/** Converge an organization's redirectUrl on the app origin. For the
 *  account-console invitation link, Keycloak resolves the post-acceptance
 *  redirect from the organization's redirectUrl — without it the invitee
 *  lands on their account settings instead of the app. Onboarding orgs get
 *  this set by the admin portal; orgs that predate that (or were created
 *  outside it) don't. Converged at invite time, not onboarding time, so
 *  every invitation works regardless of how the org was created. */
export async function ensureOrganizationRedirectUrl(orgId: string): Promise<void> {
  const org = await adminFetch<KeycloakOrganization & { redirectUrl?: string }>(
    `/organizations/${orgId}`,
  );
  if (org.redirectUrl === cytarioConfig.endpoints.webapp) return;
  await adminMutate("PUT", `/organizations/${orgId}`, {
    ...org,
    redirectUrl: cytarioConfig.endpoints.webapp,
  });
}
