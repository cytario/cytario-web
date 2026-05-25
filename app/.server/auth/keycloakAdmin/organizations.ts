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
  const params = new URLSearchParams({ search: alias, exact: "true" });
  const orgs = await adminFetch<KeycloakOrganization[]>(`/organizations?${params}`);
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

/**
 * List every member of a single organization group. KC does not document a
 * default `max` for this endpoint, but other organization listings cap at 10
 * — paginate to be safe.
 */
export async function getOrganizationGroupMembers(
  orgId: string,
  groupId: string,
): Promise<KeycloakUser[]> {
  return adminFetchAll<KeycloakUser>(
    (params) => `/organizations/${orgId}/groups/${groupId}/members?${params}`,
  );
}

/** List every top-level group in an organization (paginated). */
export async function listOrganizationGroups(orgId: string): Promise<KeycloakGroup[]> {
  return adminFetchAll<KeycloakGroup>((params) => `/organizations/${orgId}/groups?${params}`);
}

/**
 * List every direct child of an organization group (paginated; KC defaults
 * `max=10` on this endpoint).
 */
export async function listOrganizationGroupChildren(
  orgId: string,
  groupId: string,
): Promise<KeycloakGroup[]> {
  return adminFetchAll<KeycloakGroup>(
    (params) => `/organizations/${orgId}/groups/${groupId}/children?${params}`,
  );
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
