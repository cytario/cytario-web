import {
  collectGroupIds,
  fetchOrgGroupTree,
  findOrganizationByAlias,
  findOrganizationGroupByPath,
  listOrganizationGroups,
} from "~/.server/auth/keycloakAdmin";
import { ORG_ROOT_SCOPE } from "~/utils/authorization";

/**
 * Validates that every groupId belongs to the active organization's group
 * tree under `scope`. Prevents cross-scope (and cross-org) privilege
 * escalation via forged form fields referencing out-of-scope group UUIDs.
 *
 * Throws 400 if the user has no active org, 404 if the scope does not exist,
 * 403 if any groupId is out of scope.
 */
export async function assertGroupsInScope(
  groupIds: string[],
  scope: string,
  orgAlias: string | undefined,
): Promise<void> {
  if (groupIds.length === 0) return;
  if (!orgAlias) throw new Response("No active organization", { status: 400 });

  const org = await findOrganizationByAlias(orgAlias);
  if (!org) throw new Response("Organization not found", { status: 404 });

  // KC's org-groups list returns top-level only and `populateHierarchy=true`
  // builds ancestor chains, not descendant trees — recurse via `/children`
  // explicitly so the allow-list covers every nested subgroup.
  const allowed = new Set<string>();
  if (scope === ORG_ROOT_SCOPE) {
    const topLevel = await listOrganizationGroups(org.id);
    const populated = await Promise.all(topLevel.map((g) => fetchOrgGroupTree(org.id, g)));
    for (const g of populated) for (const id of collectGroupIds(g)) allowed.add(id);
  } else {
    const root = await findOrganizationGroupByPath(org.id, scope);
    if (!root) throw new Response("Scope not found", { status: 404 });
    const populated = await fetchOrgGroupTree(org.id, root);
    for (const id of collectGroupIds(populated)) allowed.add(id);
  }

  for (const groupId of groupIds) {
    if (!allowed.has(groupId)) {
      throw new Response("Not authorized", { status: 403 });
    }
  }
}
