import type { UserProfile } from "../getUserInfo";
import { adminFetch, type KeycloakGroup, type KeycloakUser } from "./client";

export interface GroupWithMembers {
  id: string;
  name: string;
  path: string;
  members: KeycloakUser[];
  subGroups: GroupWithMembers[];
}

export interface UserWithGroups {
  user: KeycloakUser;
  groupPaths: Set<string>;
}

export interface GroupInfo {
  id: string;
  path: string;
  name: string;
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
 * Recursively collect all groups with their IDs from a GroupWithMembers tree.
 * Filters out "admins" groups.
 */
export function flattenGroupsWithIds(
  group: GroupWithMembers,
  accumulator: GroupInfo[] = [],
): GroupInfo[] {
  if (group.name !== "admins") {
    accumulator.push({
      id: group.id,
      path: group.path,
      name: group.name,
    });
  }

  for (const subGroup of group.subGroups) {
    flattenGroupsWithIds(subGroup, accumulator);
  }

  return accumulator;
}

/**
 * Collect all unique users and track their group memberships from a GroupWithMembers tree.
 * Returns an array of users with their associated group paths.
 */
export function collectAllUsers(group: GroupWithMembers): UserWithGroups[] {
  const userMap = new Map<string, UserWithGroups>();

  function traverse(g: GroupWithMembers) {
    // Add members of current group
    for (const member of g.members) {
      if (!userMap.has(member.id)) {
        userMap.set(member.id, {
          user: member,
          groupPaths: new Set(),
        });
      }
      userMap.get(member.id)!.groupPaths.add(g.path);
    }

    // Traverse subgroups
    for (const subGroup of g.subGroups) {
      traverse(subGroup);
    }
  }

  traverse(group);
  return Array.from(userMap.values());
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
    id: g.id,
    name: g.name,
    path: g.path.replace(/^\//, ""),
    members: membersByGroupId.get(g.id) ?? [],
    subGroups: g.subGroups.map(buildTree),
  });

  return buildTree(group);
}
