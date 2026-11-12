import { type LoaderFunction } from "react-router";

import { adminContext } from "~/.server/auth/adminMiddleware";
import { authContext } from "~/.server/auth/authMiddleware";
import {
  collectAllUsers,
  getGroupWithMembers,
  listScopeGroups,
} from "~/.server/auth/keycloakAdmin";
import { listConnections } from "~/routes/connections/connections.server";
import { resolveScopeLabel } from "~/utils/scopeLabel";

export const usersLoader: LoaderFunction = async ({ context }) => {
  const { user, requestOrganization } = context.get(authContext);
  const { org, scope } = context.get(adminContext);

  const [group, allConnections, groups] = await Promise.all([
    getGroupWithMembers(org.id, scope),
    listConnections(user, requestOrganization),
    listScopeGroups(org.id, scope),
  ]);

  // Connections owned at this scope are not inherited from parents.
  const connections = allConnections.filter((c) => c.grants.some((g) => g.scope === scope));
  const headingLabel = resolveScopeLabel(scope, org.name || org.alias);

  if (!group) {
    return { scope, headingLabel, users: [], groups, connections };
  }

  const users = collectAllUsers(group);

  return { scope, headingLabel, users, groups, connections };
};
