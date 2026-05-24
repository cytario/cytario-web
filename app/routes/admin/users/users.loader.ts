import { type LoaderFunction } from "react-router";

import { assertAdminScope } from "../assertAdminScope";
import { authContext } from "~/.server/auth/authMiddleware";
import {
  collectAllUsers,
  findOrganizationByAlias,
  flattenGroupsWithIds,
  getGroupWithMembers,
  getOrganizationMembers,
  type UserWithGroups,
} from "~/.server/auth/keycloakAdmin";
import { listConnections } from "~/routes/connections/connections.server";
import { ORG_ROOT_ADMIN_SCOPE } from "~/utils/authorization";
import { resolveScopeLabel } from "~/utils/scopeLabel";

export const usersLoader: LoaderFunction = async ({ request, context }) => {
  const { user } = context.get(authContext);
  const { scope } = assertAdminScope(request.url, user.adminScopes);

  const isOrgRoot = scope === ORG_ROOT_ADMIN_SCOPE;

  // Connection list is org-scoped by listConnections; the route narrows it to
  // the current scope below (org-root sees only org-root-owned connections).
  const allConnectionsPromise = listConnections(user);

  if (isOrgRoot) {
    if (!user.organization) {
      throw new Response("No active organization", { status: 400 });
    }
    const org = await findOrganizationByAlias(user.organization);
    if (!org) {
      throw new Response("Organization not found in Keycloak", { status: 404 });
    }
    const [members, allConnections] = await Promise.all([
      getOrganizationMembers(org.id),
      allConnectionsPromise,
    ]);

    const users: UserWithGroups[] = members.map((member) => ({
      user: member,
      groupPaths: new Set<string>(),
      adminScopes: new Set<string>(),
    }));

    // Connections owned at the org-root scope match the sentinel literally.
    const connections = allConnections.filter((c) => c.ownerScope === ORG_ROOT_ADMIN_SCOPE);

    return {
      scope,
      headingLabel: resolveScopeLabel(scope, org.name || org.alias),
      users,
      groups: [],
      connections,
    };
  }

  const [group, allConnections] = await Promise.all([
    getGroupWithMembers(scope),
    allConnectionsPromise,
  ]);

  // Narrow to exact scope — connections are not inherited from parent scopes
  const connections = allConnections.filter((c) => c.ownerScope === scope);

  const headingLabel = resolveScopeLabel(scope, user.organization);

  if (!group) {
    return { scope, headingLabel, users: [], groups: [], connections };
  }

  const users = collectAllUsers(group);
  const groups = flattenGroupsWithIds(group);

  return { scope, headingLabel, users, groups, connections };
};
