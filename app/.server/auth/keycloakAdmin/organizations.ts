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

/**
 * Create a top-level group inside the organization
 * (`POST /organizations/{orgId}/groups`, KC 26.6+).
 */
export async function createOrganizationTopLevelGroup(
  orgId: string,
  name: string,
): Promise<Response> {
  return adminMutate("POST", `/organizations/${orgId}/groups`, { name });
}

/**
 * Create a child group under an existing organization group
 * (`POST /organizations/{orgId}/groups/{groupId}/children`, KC 26.6+).
 */
export async function createOrganizationSubgroup(
  orgId: string,
  parentGroupId: string,
  name: string,
): Promise<Response> {
  return adminMutate("POST", `/organizations/${orgId}/groups/${parentGroupId}/children`, {
    name,
  });
}

/**
 * Locate an organization group by its org-relative path
 * (`GET /organizations/{orgId}/groups/group-by-path/{path}`, KC 26.6+).
 *
 * Returns undefined when the path does not resolve within the org so callers
 * can map it to a 404 themselves.
 */
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

/** Delete an organization group (rollback after a partial create). */
export async function deleteOrganizationGroup(orgId: string, groupId: string): Promise<Response> {
  return adminMutate("DELETE", `/organizations/${orgId}/groups/${groupId}`);
}

/**
 * Add a user to an organization group
 * (`PUT /organizations/{orgId}/groups/{groupId}/members/{userId}`, KC 26.6+).
 * Required for org groups — the realm-level
 * `PUT /users/{userId}/groups/{groupId}` endpoint returns 400 for groups
 * owned by an organization.
 */
export async function addUserToOrganizationGroup(
  orgId: string,
  groupId: string,
  userId: string,
): Promise<Response> {
  return adminMutate("PUT", `/organizations/${orgId}/groups/${groupId}/members/${userId}`);
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
