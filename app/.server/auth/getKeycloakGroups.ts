import type { UserProfile } from "./getUserInfo";
import { cytarioConfig } from "~/config";

interface KeycloakGroup {
  id: string;
  name: string;
  path: string;
  subGroups: KeycloakGroup[];
}

const getAdminApiBaseUrl = (): string =>
  cytarioConfig.auth.baseUrl.replace("/realms/", "/admin/realms/");

async function fetchGroups(
  accessToken: string,
  search?: string,
): Promise<KeycloakGroup[]> {
  const adminApiBaseUrl = getAdminApiBaseUrl();
  const params = new URLSearchParams({ exact: "true" });
  if (search) params.set("q", search);

  const response = await fetch(`${adminApiBaseUrl}/groups?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(
      `Keycloak groups API failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

/**
 * Recursively flatten a group tree to a list of normalized paths,
 * filtering out groups whose name is "admins".
 */
export function flattenGroups(groups: KeycloakGroup[]): string[] {
  const result: string[] = [];

  for (const group of groups) {
    const normalized = group.path.replace(/^\//, "");

    if (group.name !== "admins") {
      result.push(normalized);
    }

    if (group.subGroups.length > 0) {
      result.push(...flattenGroups(group.subGroups));
    }
  }

  return result;
}

/**
 * Fetches all group scopes manageable by the user from the Keycloak Admin API.
 * For each admin scope, fetches the group tree and flattens all descendants.
 */
export async function getManageableScopes(
  user: UserProfile,
  accessToken: string,
): Promise<string[]> {
  if (user.adminScopes.length === 0) return [];

  const allScopes = new Set<string>();

  for (const adminScope of user.adminScopes) {
    const groups = await fetchGroups(accessToken, adminScope);

    for (const path of flattenGroups(groups)) {
      allScopes.add(path);
    }
  }

  return [...allScopes].sort();
}
