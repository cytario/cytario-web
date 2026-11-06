import { createContext, type MiddlewareFunction } from "react-router";

import { authContext } from "./authMiddleware";
import { findOrganizationByAlias, type KeycloakOrganization } from "./keycloakAdmin";
import { assertAdminScope } from "~/routes/admin/assertAdminScope";

export interface AdminContextData {
  org: KeycloakOrganization;
  scope: string;
  adminUrl: string;
}

export const adminContext = createContext<AdminContextData>();

export const adminMiddleware: MiddlewareFunction = async ({ request, context }, next) => {
  const { user, requestOrganization } = context.get(authContext);

  if (!requestOrganization) {
    throw new Response("No active organization", { status: 400 });
  }

  const { scope, adminUrl } = assertAdminScope(request.url, user.adminScopes);

  const org = await findOrganizationByAlias(requestOrganization);
  if (!org) {
    throw new Response("Organization not found in Keycloak", { status: 404 });
  }

  context.set(adminContext, { org, scope, adminUrl });

  return next();
};
