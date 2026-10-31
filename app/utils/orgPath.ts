/**
 * Every organization-scoped route lives directly under the organization alias:
 * `/{org}/recent`, `/{org}/{connectionId}/…`. The alias is the first path
 * segment — an org named like a fixed top-level route (login, api, …) is
 * refused at alias creation, never here; the layout therefore treats any
 * first segment that is not a reserved route as an organization.
 */

/**
 * Top-level paths that can never be an organization alias — they are the
 * platform's own routes. Keycloak-side alias creation (the admin portal's
 * onboarding and the e2e fixtures) refuses these names; listing them here
 * keeps the org layout's catch-all from capturing them.
 */
export const RESERVED_PATH_ROOTS = [
  "/login",
  "/logout",
  "/auth",
  "/onboarding",
  "/api",
  "/recent",
  "/favorites",
  "/config",
  "/connections",
  "/admin",
  "/plugin",
  "/agent",
] as const;

const RESERVED_ROOT_SET = new Set<string>(RESERVED_PATH_ROOTS);

const ORG_PATH_PATTERN = /^\/([^/]+)(\/.*)?$/;

const isReservedRoot = (pathname: string): boolean => {
  const firstSegment = `/${pathname.split("/").filter(Boolean)[0] ?? ""}`;
  return RESERVED_ROOT_SET.has(firstSegment);
};

/**
 * Prefixes `path` with the organization's route root. Without an organization
 * the path is returned untouched — callers outside an organization context
 * (tests, unauthenticated chrome) must not emit a half-built `/undefined/…`.
 * An absolute URL is also left alone: it already names its destination.
 */
export function orgPath(organization: string | undefined, path: string): string {
  if (!organization) return path;
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//")) return path;
  const tail = path.replace(/^\/+/, "");
  const base = `/${encodeURIComponent(organization)}`;
  return tail ? `${base}/${tail}` : base;
}

/**
 * The organization alias carried by `pathname`, `undefined` outside an
 * organization context. Reserved top-level routes are never organizations.
 */
export function organizationFromPath(pathname: string): string | undefined {
  const match = ORG_PATH_PATTERN.exec(pathname);
  const alias = match?.[1];
  if (!alias || isReservedRoot(pathname)) return undefined;
  try {
    return decodeURIComponent(alias);
  } catch {
    return alias;
  }
}

/** Drops the organization prefix: `/acme/recent` → `/recent`. */
export function stripOrgPath(pathname: string): string {
  if (!organizationFromPath(pathname)) return pathname;
  const match = ORG_PATH_PATTERN.exec(pathname);
  return match?.[2] ?? "/";
}

/**
 * Whether `subPath` (already org-stripped) names a view that exists in every
 * organization — a reserved route such as `/recent` or `/admin/users`. A
 * connection id or object path does not: it belongs to the tenant it lives
 * in, so redirecting it into another organization would land on a 404.
 */
export function isOrgAgnosticPath(subPath: string): boolean {
  return isReservedRoot(subPath);
}

/**
 * The org-switch target: the chosen organization's root (its connection
 * list). The current sub-path is deliberately not kept — a connection id or
 * object path belongs to the tenant it lives in, and the same path in another
 * organization is always a 404.
 */
export function switchOrgPath(organization: string): string {
  return orgPath(organization, "/");
}

/**
 * Where an un-prefixed app path belongs now, or `undefined` when the path is
 * not one of the moved routes (a genuine 404 must stay a 404 rather than
 * redirecting in a loop).
 *
 * The connection object browser's legacy path was `/connections/:id/…`; the
 * org-scoped equivalent drops the `connections` segment, so legacy links map
 * `/connections/:id/…` → `/{org}/:id/…`.
 */
export function legacyRedirectPath(
  pathname: string,
  organization: string | undefined,
): string | undefined {
  if (!organization) return undefined;
  if (pathname === "/") return orgPath(organization, "/");

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return orgPath(organization, "/");

  const [first, ...rest] = segments;
  if (first === "connections") {
    // /connections            → /{org}           (the connection list is the org root)
    // /connections/:id/…      → /{org}/:id/…      (the object browser)
    const restPath = rest.length > 0 ? `/${rest.join("/")}` : "";
    return orgPath(organization, restPath || "/");
  }
  const legacyRoot = `/${first}`;
  const isLegacyPath =
    RESERVED_ROOT_SET.has(legacyRoot) && legacyRoot !== "/connections" && legacyRoot !== "/api";
  if (isLegacyPath) {
    // The whole legacy path moves under the org: /admin/users → /{org}/admin/users.
    return orgPath(organization, pathname);
  }
  return undefined;
}
