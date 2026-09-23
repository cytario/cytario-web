import { type LoaderFunction } from "react-router";

import { adminContext } from "~/.server/auth/adminMiddleware";
import { authContext } from "~/.server/auth/authMiddleware";
import {
  collectAllUsers,
  flattenGroupsWithIds,
  getGroupWithMembers,
} from "~/.server/auth/keycloakAdmin";
import { listConnections } from "~/routes/connections/connections.server";
import { ORG_ROOT_SCOPE } from "~/utils/authorization";
import { compareGroupPaths } from "~/utils/groupPath";
import { resolveScopeLabel } from "~/utils/scopeLabel";

export const usersLoader: LoaderFunction = async ({ context }) => {
  const { user } = context.get(authContext);
  const { org, scope } = context.get(adminContext);

  const [group, allConnections] = await Promise.all([
    getGroupWithMembers(org.id, scope),
    listConnections(user),
  ]);

  // Connections owned at this scope are not inherited from parents.
  const connections = allConnections.filter((c) => c.grants.some((g) => g.scope === scope));
  const headingLabel = resolveScopeLabel(scope, org.name || org.alias);

  if (!group) {
    return { scope, headingLabel, users: [], groups: [], connections };
  }

  const users = collectAllUsers(group);
  // The synthesised org-root node is not a real group — hide it from the
  // group-membership UI.
  const groups = (
    scope === ORG_ROOT_SCOPE
      ? group.subGroups.flatMap((sg) => flattenGroupsWithIds(sg))
      : flattenGroupsWithIds(group)
  ).sort((a, b) => compareGroupPaths(a.path, b.path));

  return { scope, headingLabel, users, groups, connections };
};
