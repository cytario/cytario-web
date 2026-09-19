import { KeycloakAdminError, type KeycloakGroup, type KeycloakUser } from "./client";
import {
  createOrganizationSubgroup,
  deleteOrganizationGroup,
  findOrganizationByAlias,
  findOrganizationGroupByPath,
  getOrganizationGroupMembers,
  getOrganizationMembers,
  listOrganizationGroups,
} from "./organizations";
import { ORG_ROOT_SCOPE } from "~/utils/authorization";

async function attachOrgSubtree(orgId: string, root: KeycloakGroup): Promise<KeycloakGroup> {
  const children = await listOrganizationGroups(orgId, root.id);
  return {
    ...root,
    subGroups: await Promise.all(children.map((c) => attachOrgSubtree(orgId, c))),
  };
}

export async function fetchOrgGroupTree(
  orgId: string,
  anchor?: KeycloakGroup,
): Promise<KeycloakGroup[]> {
  const roots = anchor ? [anchor] : await listOrganizationGroups(orgId);
  return Promise.all(roots.map((r) => attachOrgSubtree(orgId, r)));
}

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
}

export function collectGroupIds(group: KeycloakGroup): string[] {
  return [group.id, ...group.subGroups.flatMap(collectGroupIds)];
}

// Returns the org-relative path (leading slash stripped) matching the format
// of `identity.groups`, or `undefined` when the id is not in the tree.
export function findGroupPathInTree(
  groups: readonly KeycloakGroup[],
  groupId: string,
): string | undefined {
  for (const g of groups) {
    if (g.id === groupId) return g.path.replace(/^\//, "");
    const sub = findGroupPathInTree(g.subGroups, groupId);
    if (sub) return sub;
  }
  return undefined;
}

export function flattenGroupsWithIds(
  group: GroupWithMembers,
  accumulator: GroupInfo[] = [],
): GroupInfo[] {
  accumulator.push({
    id: group.id,
    path: group.path,
    name: group.name,
  });

  for (const subGroup of group.subGroups) {
    flattenGroupsWithIds(subGroup, accumulator);
  }

  return accumulator;
}

export function collectAllUsers(group: GroupWithMembers): UserWithGroups[] {
  const userMap = new Map<string, UserWithGroups>();

  function traverse(g: GroupWithMembers) {
    for (const member of g.members) {
      if (!userMap.has(member.id)) {
        userMap.set(member.id, {
          user: member,
          groupPaths: new Set(),
          adminScopes: new Set(),
        });
      }
      const entry = userMap.get(member.id)!;
      if (g.path !== ORG_ROOT_SCOPE) entry.groupPaths.add(g.path);
      if (g.name === "admins") {
        entry.adminScopes.add(g.path.replace(/\/admins$/, ""));
      }
    }

    for (const subGroup of g.subGroups) {
      traverse(subGroup);
    }
  }

  traverse(group);
  return Array.from(userMap.values());
}

function extractIdFromLocation(response: Response, what: string): string {
  const location = response.headers.get("location");
  if (!location) {
    throw new Error(`Missing Location header from ${what} response`);
  }
  const id = location.split("/").pop();
  if (!id) {
    throw new Error(`Could not extract ID from ${what} Location header`);
  }
  return id;
}

// The Organization Groups API isolates the hierarchy per-org — the realm-wide
// groups endpoint allowed path collisions when two orgs picked the same name.
// If the admins subgroup creation fails, the parent is rolled back (deleted).
export async function createGroup(
  parentScope: string,
  name: string,
  organization: string | undefined,
): Promise<{ id: string; path: string; adminsGroupId: string; orgId: string }> {
  if (!organization) {
    throw new KeycloakAdminError(400, "Active organization is required to create a group");
  }
  const org = await findOrganizationByAlias(organization);
  if (!org) {
    throw new KeycloakAdminError(404, `Organization not found: ${organization}`);
  }

  const isOrgRoot = parentScope === ORG_ROOT_SCOPE;
  const parentGroupId = isOrgRoot ? undefined : await resolveOrgGroupId(org.id, parentScope);

  const createResponse = await createOrganizationSubgroup(org.id, parentGroupId, name);
  const newGroupId = extractIdFromLocation(createResponse, "group creation");

  let adminsGroupId: string;
  try {
    const adminsResponse = await createOrganizationSubgroup(org.id, newGroupId, "admins");
    adminsGroupId = extractIdFromLocation(adminsResponse, "admins subgroup creation");
  } catch (e) {
    console.error("Failed to create admins subgroup, rolling back:", e);
    try {
      await deleteOrganizationGroup(org.id, newGroupId);
    } catch (rollbackErr) {
      console.error("Rollback also failed, orphaned group:", rollbackErr);
    }
    throw e;
  }

  return {
    id: newGroupId,
    path: isOrgRoot ? name : `${parentScope}/${name}`,
    adminsGroupId,
    orgId: org.id,
  };
}

async function resolveOrgGroupId(orgId: string, parentScope: string): Promise<string> {
  const parent = await findOrganizationGroupByPath(orgId, parentScope);
  if (!parent) {
    throw new KeycloakAdminError(404, `Parent group not found in organization: ${parentScope}`);
  }
  return parent.id;
}

async function attachMembers(orgId: string, group: KeycloakGroup): Promise<GroupWithMembers> {
  const [members, subGroups] = await Promise.all([
    getOrganizationGroupMembers(orgId, group.id),
    Promise.all(group.subGroups.map((sg) => attachMembers(orgId, sg))),
  ]);
  return {
    id: group.id,
    name: group.name,
    path: group.path.replace(/^\//, ""),
    members,
    subGroups,
  };
}

// The `ORG_ROOT_SCOPE` sentinel synthesises a virtual root whose members are
// the full org membership and whose subgroups are the top-level groups.
export async function getGroupWithMembers(
  orgId: string,
  scope: string,
): Promise<GroupWithMembers | undefined> {
  if (scope === ORG_ROOT_SCOPE) {
    const [populated, members] = await Promise.all([
      fetchOrgGroupTree(orgId),
      getOrganizationMembers(orgId),
    ]);
    return {
      id: orgId,
      name: ORG_ROOT_SCOPE,
      path: ORG_ROOT_SCOPE,
      members,
      subGroups: await Promise.all(populated.map((g) => attachMembers(orgId, g))),
    };
  }

  const root = await findOrganizationGroupByPath(orgId, scope);
  if (!root) return undefined;
  const [populated] = await fetchOrgGroupTree(orgId, root);
  return attachMembers(orgId, populated);
}
