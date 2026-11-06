import { adminScopesCover } from "~/utils/authorization";
import { organizationFromPath, orgPath } from "~/utils/orgPath";

/**
 * Assert the acting user administers `scope` under the admin-scope ancestry
 * model, reusing the shared `adminScopesCover` predicate. Throws an HTTP 403
 * Response when the user is not authorized; returns nothing on success.
 * The `*` sentinel is only coverable by an org-root admin.
 */
export function assertGrantScope(scope: string, adminScopes: string[]): void {
  if (!adminScopesCover(adminScopes, scope)) {
    throw new Response("Not authorized", { status: 403 });
  }
}

/**
 * Validates that the user has admin privileges for the scope named in the
 * URL's `scope` search param. Throws HTTP 400 if scope is missing, or HTTP
 * 403 if unauthorized. The `ORG_ROOT_SCOPE` sentinel (`*`) — the active org
 * as a whole — may only be targeted by users carrying it themselves. The
 * returned URL stays inside the request's own organization, so a redirect after
 * an admin action lands back in the tenant it acted on.
 */
export function assertAdminScope(
  url: string,
  adminScopes: string[],
): { scope: string; adminUrl: string } {
  const requestUrl = new URL(url);
  const scope = requestUrl.searchParams.get("scope");
  if (!scope) throw new Response("Missing scope", { status: 400 });

  assertGrantScope(scope, adminScopes);

  return {
    scope,
    adminUrl: adminUsersPath(organizationFromPath(requestUrl.pathname), scope),
  };
}

/** The user-management screen for `scope`, inside the session's organization. */
export function adminUsersPath(organization: string | undefined, scope: string): string {
  return orgPath(organization, `/admin/users?scope=${encodeURIComponent(scope)}`);
}
