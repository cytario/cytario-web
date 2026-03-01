/**
 * Validates that the user has admin privileges for the given scope.
 * Throws an HTTP 400 if scope is missing, or HTTP 403 if unauthorized.
 */
export function assertAdminScope(
  url: string,
  adminScopes: string[],
): { scope: string; adminUrl: string } {
  const scope = new URL(url).searchParams.get("scope");
  if (!scope) throw new Response("Missing scope", { status: 400 });

  const isAdmin = adminScopes.some(
    (s) => scope === s || scope.startsWith(s + "/"),
  );
  if (!isAdmin) throw new Response("Not authorized", { status: 403 });

  return {
    scope,
    adminUrl: `/admin/users?scope=${encodeURIComponent(scope)}`,
  };
}
