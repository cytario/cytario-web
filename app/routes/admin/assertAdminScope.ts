import { ORG_ROOT_ADMIN_SCOPE } from "~/utils/authorization";

/**
 * Validates that the user has admin privileges for the given scope.
 * Throws an HTTP 400 if scope is missing, or HTTP 403 if unauthorized.
 *
 * The `ORG_ROOT_ADMIN_SCOPE` sentinel (`*`) represents "the active org as a
 * whole" — only users carrying that scope themselves may target it.
 */
export function assertAdminScope(
  url: string,
  adminScopes: string[],
): { scope: string; adminUrl: string } {
  const scope = new URL(url).searchParams.get("scope");
  if (!scope) throw new Response("Missing scope", { status: 400 });

  const isAdmin =
    scope === ORG_ROOT_ADMIN_SCOPE
      ? adminScopes.includes(ORG_ROOT_ADMIN_SCOPE)
      : adminScopes.some(
          (s) => s === ORG_ROOT_ADMIN_SCOPE || scope === s || scope.startsWith(s + "/"),
        );
  if (!isAdmin) throw new Response("Not authorized", { status: 403 });

  return {
    scope,
    adminUrl: `/admin/users?scope=${encodeURIComponent(scope)}`,
  };
}
