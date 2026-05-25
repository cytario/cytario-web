import {
  adminFetch,
  adminFormMutate,
  adminMutate,
  type KeycloakGroup,
  type KeycloakUser,
} from "./client";

export interface KeycloakOrganization {
  id: string;
  name: string;
  alias: string;
  description?: string;
  domains?: { name: string; verified?: boolean }[];
}

/** Locate a Keycloak organization by its alias. */
export async function findOrganizationByAlias(
  alias: string,
): Promise<KeycloakOrganization | undefined> {
  const params = new URLSearchParams({ search: alias, exact: "true" });
  const orgs = await adminFetch<KeycloakOrganization[]>(`/organizations?${params}`);
  return orgs.find((o) => o.alias === alias);
}

/** List all members of a Keycloak organization. */
export async function getOrganizationMembers(orgId: string): Promise<KeycloakUser[]> {
  return adminFetch<KeycloakUser[]>(`/organizations/${orgId}/members?max=500`);
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

/** List members of a single organization group. */
export async function getOrganizationGroupMembers(
  orgId: string,
  groupId: string,
): Promise<KeycloakUser[]> {
  return adminFetch<KeycloakUser[]>(`/organizations/${orgId}/groups/${groupId}/members?max=500`);
}

/** List groups in an organization, optionally with the full hierarchy populated. */
export async function listOrganizationGroups(
  orgId: string,
  options: { populateHierarchy?: boolean } = {},
): Promise<KeycloakGroup[]> {
  const params = new URLSearchParams({ max: "500" });
  if (options.populateHierarchy) {
    params.set("populateHierarchy", "true");
    // `briefRepresentation` defaults to true and drops attributes + subGroups
    // from the response even when `populateHierarchy=true`. Force the full
    // representation so the hierarchy actually round-trips.
    params.set("briefRepresentation", "false");
  }
  return adminFetch<KeycloakGroup[]>(`/organizations/${orgId}/groups?${params}`);
}

/**
 * Send an organization invitation to the given email
 * (`POST /organizations/{orgId}/members/invite-user`, KC 26+). Keycloak
 * provisions the user if needed and emails the join link; firstName /
 * lastName are only used when the user does not already exist.
 *
 * Endpoint consumes `application/x-www-form-urlencoded`.
 *
 * KC returns 409 both for "pending invitation already exists" and
 * "user already a member" — both are benign from the caller's POV; the
 * action layer should classify them as warnings rather than errors.
 */
export async function inviteOrganizationUser(
  orgId: string,
  email: string,
  firstName?: string,
  lastName?: string,
): Promise<Response> {
  const body = new URLSearchParams();
  body.set("email", email);
  if (firstName) body.set("firstName", firstName);
  if (lastName) body.set("lastName", lastName);
  return adminFormMutate("POST", `/organizations/${orgId}/members/invite-user`, body);
}
