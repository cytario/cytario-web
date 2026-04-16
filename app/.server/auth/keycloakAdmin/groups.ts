import type { UserProfile } from "../getUserInfo";
import {
  adminFetch,
  adminMutate,
  KeycloakAdminError,
  type KeycloakGroup,
  type KeycloakUser,
} from "./client";

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
  adminScopes: Set<string>;
}

export interface GroupInfo {
  id: string;
  path: string;
  name: string;
  isAdmin: boolean;
}

async function fetchGroups(search?: string): Promise<KeycloakGroup[]> {
  const params = new URLSearchParams({ exact: "true" });
  if (search) params.set("q", search);
  return adminFetch(`/groups?${params}`);
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
 * For each admin scope, finds the exact group by path and flattens its descendants.
 * Uses findGroupByPath instead of search to avoid returning unrelated groups.
 */
export async function getManageableScopes(
  user: UserProfile,
): Promise<string[]> {
  if (user.adminScopes.length === 0) return [];

  const allScopes = new Set<string>();

  for (const adminScope of user.adminScopes) {
    allScopes.add(adminScope);
    try {
      const group = await findGroupByPath(adminScope);
      if (group) {
        for (const path of flattenGroups(group.subGroups)) {
          allScopes.add(path);
        }
      }
    } catch (error) {
      console.warn(
        `Failed to fetch group tree for admin scope "${adminScope}":`,
        error,
      );
    }
  }

  return [...allScopes].sort();
}

/**
 * Finds a Keycloak group by its normalized path (e.g. "cytario/lab").
 */
export async function findGroupByPath(
  scope: string,
): Promise<KeycloakGroup | undefined> {
  const topLevel = scope.split("/")[0];
  const groups = await fetchGroups(topLevel);
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
  accumulator.push({
    id: group.id,
    path: group.path,
    name: group.name,
    isAdmin: group.name === "admins",
  });

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
          adminScopes: new Set(),
        });
      }
      const entry = userMap.get(member.id)!;
      entry.groupPaths.add(g.path);
      if (g.name === "admins") {
        entry.adminScopes.add(g.path.replace(/\/admins$/, ""));
      }
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
 * Creates a subgroup under the given parent scope, and auto-creates an
 * "admins" subgroup inside the new group for admin delegation.
 *
 * If the admins subgroup creation fails, the parent group is rolled back
 * (deleted) to avoid leaving the hierarchy in an inconsistent state.
 */
export async function createGroup(
  parentScope: string,
  name: string,
): Promise<{ id: string; path: string }> {
  const parent = await findGroupByPath(parentScope);
  if (!parent) {
    throw new KeycloakAdminError(404, `Parent group not found: ${parentScope}`);
  }

  const response = await adminMutate(
    "POST",
    `/groups/${parent.id}/children`,
    { name },
  );

  const location = response.headers.get("location");
  if (!location) {
    throw new Error("Missing Location header from group creation response");
  }
  const newGroupId = location.split("/").pop();
  if (!newGroupId) {
    throw new Error("Could not extract group ID from Location header");
  }

  try {
    await adminMutate("POST", `/groups/${newGroupId}/children`, {
      name: "admins",
    });
  } catch (e) {
    console.error("Failed to create admins subgroup, rolling back:", e);
    await adminMutate("DELETE", `/groups/${newGroupId}`);
    throw e;
  }

  return {
    id: newGroupId,
    path: `${parentScope}/${name}`,
  };
}

/**
 * Fetches members for a group and all its sub-groups, returning the tree structure.
 */
export async function getGroupWithMembers(
  scope: string,
): Promise<GroupWithMembers | undefined> {
  const group = await findGroupByPath(scope);
  if (!group) return undefined;

  const allIds = collectGroupIds(group);
  const membersByGroupId = new Map<string, KeycloakUser[]>();

  await Promise.all(
    allIds.map(async (id) => {
      const members = await adminFetch<KeycloakUser[]>(
        `/groups/${id}/members?max=500`,
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
