import { adminFetch, type KeycloakUser } from "./client";

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
