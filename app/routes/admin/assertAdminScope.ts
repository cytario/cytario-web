import { adminScopesCover } from "~/utils/authorization";

/**
 * Assert the acting user administers `scope` under the admin-scope ancestry model,
 * reusing the shared `adminScopesCover` predicate. Throws an HTTP
 * 403 Response when the user is not authorized; returns nothing on success.
 *
 * This is the primitive the URL-oriented `assertAdminScope` and any request that
 * has already re-derived the target scope server-side (e.g. the Share write's
 * grant authorization) share, so user management
 * and sharing evaluate the identical group-administration rule. The `*` sentinel
 * is only coverable by an org-root admin.
 */
export function assertGrantScope(scope: string, adminScopes: string[]): void {
  if (!adminScopesCover(adminScopes, scope)) {
    throw new Response("Not authorized", { status: 403 });
  }
}

/**
 * Validates that the user has admin privileges for the scope named in the URL's
 * `scope` search param. Throws an HTTP 400 if scope is missing, or HTTP 403 if
 * unauthorized.
 *
 * The `ORG_ROOT_SCOPE` sentinel (`*`) represents "the active org as a whole" — only users carrying
 * that scope themselves may target it.
 */
export function assertAdminScope(
  url: string,
  adminScopes: string[],
): { scope: string; adminUrl: string } {
  const scope = new URL(url).searchParams.get("scope");
  if (!scope) throw new Response("Missing scope", { status: 400 });

  assertGrantScope(scope, adminScopes);

  return {
    scope,
    adminUrl: `/admin/users?scope=${encodeURIComponent(scope)}`,
  };
}
