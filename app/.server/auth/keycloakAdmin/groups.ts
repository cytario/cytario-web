import { LRUCache } from "lru-cache";

import type { UserProfile } from "../getUserInfo";
import {
  adminFetch,
  adminMutate,
  KeycloakAdminError,
  type KeycloakGroup,
  type KeycloakUser,
} from "./client";

/**
 * Maps a normalized group path (e.g. "cytario/lab") to its Keycloak group ID.
 *
 * Group IDs are stable for the lifetime of a group, but a path may go stale if
 * a group is renamed or deleted. The TTL bounds staleness; mutating callers
 * (createGroup) refresh entries explicitly. On a write that targets a cached
 * parent ID and gets a 404, the entry is dropped so the next attempt rebuilds it.
 */
const groupIdByPath = new LRUCache<string, string>({
  max: 500,
  ttl: 10 * 60 * 1000,
});

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

/**
 * Searches Keycloak groups by name. `exact=true` is load-bearing — it makes
 * `search` an exact-name match instead of a substring match. `max=1000`
 * defeats Keycloak's default page size of 20, which would silently truncate
 * results for realms with many top-level groups.
 */
async function fetchGroups(search?: string): Promise<KeycloakGroup[]> {
  const params = new URLSearchParams({ exact: "true", max: "1000" });
  if (search) params.set("search", search);
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
 * Populates the path-to-id cache as a side effect so subsequent ID-only
 * lookups (createGroup, addUserToGroup) skip the round trip.
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

  const result = search(groups);
  if (result) groupIdByPath.set(scope, result.id);
  return result;
}

/**
 * Resolves a normalized group path to its Keycloak group ID. Uses an in-memory
 * cache to avoid the `/groups` round trip on warm paths. On a cache miss,
 * falls back to {@link findGroupByPath}, which also populates the cache.
 */
export async function findGroupIdByPath(
  scope: string,
): Promise<string | undefined> {
  const cached = groupIdByPath.get(scope);
  if (cached) return cached;

  const group = await findGroupByPath(scope);
  return group?.id;
}

/**
 * Drops the cached ID for a group path. Call when a write fails with 404,
 * indicating the underlying group was deleted or renamed.
 */
export function invalidateGroupIdCache(scope: string): void {
  groupIdByPath.delete(scope);
}

/**
 * Records a known path → ID mapping. Used after createGroup so the freshly
 * created group's children/members lookups (e.g. the post-redirect loader)
 * hit the cache immediately.
 */
export function cacheGroupId(scope: string, id: string): void {
  groupIdByPath.set(scope, id);
}

/** Test-only: clears all cached path → ID mappings. */
export function __resetGroupIdCache(): void {
  groupIdByPath.clear();
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
): Promise<{ id: string; path: string; adminsGroupId: string }> {
  const parentId = await findGroupIdByPath(parentScope);
  if (!parentId) {
    throw new KeycloakAdminError(404, `Parent group not found: ${parentScope}`);
  }

  let response: Response;
  try {
    response = await adminMutate("POST", `/groups/${parentId}/children`, {
      name,
    });
  } catch (e) {
    if (e instanceof KeycloakAdminError && e.status === 404) {
      invalidateGroupIdCache(parentScope);
    }
    throw e;
  }

  const location = response.headers.get("location");
  if (!location) {
    throw new Error("Missing Location header from group creation response");
  }
  const newGroupId = location.split("/").pop();
  if (!newGroupId) {
    throw new Error("Could not extract group ID from Location header");
  }

  let adminsGroupId: string;
  try {
    const adminsResponse = await adminMutate(
      "POST",
      `/groups/${newGroupId}/children`,
      { name: "admins" },
    );
    const adminsLocation = adminsResponse.headers.get("location");
    adminsGroupId = adminsLocation?.split("/").pop() ?? "";
    if (!adminsGroupId) {
      throw new Error("Missing Location header from admins subgroup creation");
    }
  } catch (e) {
    console.error("Failed to create admins subgroup, rolling back:", e);
    try {
      await adminMutate("DELETE", `/groups/${newGroupId}`);
    } catch (rollbackErr) {
      console.error("Rollback also failed, orphaned group:", rollbackErr);
    }
    throw e;
  }

  const newGroupPath = `${parentScope}/${name}`;
  cacheGroupId(newGroupPath, newGroupId);
  cacheGroupId(`${newGroupPath}/admins`, adminsGroupId);

  return {
    id: newGroupId,
    path: newGroupPath,
    adminsGroupId,
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
