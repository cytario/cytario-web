import type { UserProfile } from "../getUserInfo";
import { adminFetch, type KeycloakGroup, type KeycloakUser } from "./client";

export interface GroupWithMembers {
  name: string;
  path: string;
  members: KeycloakUser[];
  subGroups: GroupWithMembers[];
}

async function fetchGroups(
  accessToken: string,
  search?: string,
): Promise<KeycloakGroup[]> {
  const params = new URLSearchParams({ exact: "true" });
  if (search) params.set("q", search);
  return adminFetch(accessToken, `/groups?${params}`);
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

  const allScopes = new Set<string>(user.adminScopes);

  for (const adminScope of user.adminScopes) {
    try {
      const groups = await fetchGroups(accessToken, adminScope);
      for (const path of flattenGroups(groups)) {
        allScopes.add(path);
      }
    } catch {
      // Fall back to adminScopes on API/network error
    }
  }

  return [...allScopes].sort();
}

/**
 * Finds a Keycloak group by its normalized path (e.g. "cytario/lab").
 */
export async function findGroupByPath(
  accessToken: string,
  scope: string,
): Promise<KeycloakGroup | undefined> {
  const topLevel = scope.split("/")[0];
  const groups = await fetchGroups(accessToken, topLevel);
  const targetPath = `/${scope}`;

  const search = (groups: KeycloakGroup[]): KeycloakGroup | undefined => {
    for (const g of groups) {
      if (g.path === targetPath) return g;
      const found = search(g.subGroups);
      if (found) return found;
    }
  };

  return search(groups);
}

function collectGroupIds(group: KeycloakGroup): string[] {
  return [group.id, ...group.subGroups.flatMap(collectGroupIds)];
}

/**
 * Fetches members for a group and all its sub-groups, returning the tree structure.
 */
export async function getGroupWithMembers(
  accessToken: string,
  scope: string,
): Promise<GroupWithMembers | undefined> {
  const group = await findGroupByPath(accessToken, scope);
  if (!group) return undefined;

  const allIds = collectGroupIds(group);
  const membersByGroupId = new Map<string, KeycloakUser[]>();

  await Promise.all(
    allIds.map(async (id) => {
      const members = await adminFetch<KeycloakUser[]>(
        accessToken,
        `/groups/${id}/members`,
      );
      membersByGroupId.set(id, members);
    }),
  );

  const buildTree = (g: KeycloakGroup): GroupWithMembers => ({
    name: g.name,
    path: g.path.replace(/^\//, ""),
    members: membersByGroupId.get(g.id) ?? [],
    subGroups: g.subGroups.map(buildTree),
  });

  return buildTree(group);
}
