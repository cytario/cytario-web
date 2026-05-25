import {
  adminFetch,
  adminFetchAll,
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

/**
 * List groups in an organization. Without `groupId` returns every top-level
 * org group; with `groupId` returns that group's direct children. Paginated
 * (KC defaults `max=10` on the children endpoint).
 */
export async function listOrganizationGroups(
  orgId: string,
  groupId?: string,
): Promise<KeycloakGroup[]> {
  const path = groupId
    ? `/organizations/${orgId}/groups/${groupId}/children`
    : `/organizations/${orgId}/groups`;
  return adminFetchAll<KeycloakGroup>((params) => `${path}?${params}`);
}

/**
 * Send an organization invitation to the given email
 *
 * Keycloak provisions the user if needed and emails the join link; firstName / lastName are only used when the user does not already exist.
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
