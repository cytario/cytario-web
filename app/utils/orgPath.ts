/** Every organization-scoped route lives under this prefix. */
export const ORG_ROUTE_PREFIX = "/o";

const ORG_PATH_PATTERN = /^\/o\/([^/]+)(\/.*)?$/;

// The app routes that moved under the organization prefix. Un-prefixed requests
// for one of these are redirected rather than served, so bookmarks and plugin
// links written before the prefix existed keep working.
const LEGACY_APP_PATHS = [
  "/recent",
  "/favorites",
  "/config",
  "/connections",
  "/plugin",
  "/admin",
  "/agent",
] as const;

/**
 * Prefixes `path` with `organization`'s route prefix. Without an organization
 * the path is returned untouched — callers outside an organization context
 * (tests, unauthenticated chrome) must not emit a half-built `/o/undefined/…`.
 * An absolute URL is also left alone: it already names its destination.
 */
export function orgPath(organization: string | undefined, path: string): string {
  if (!organization) return path;
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//")) return path;
  const tail = path.replace(/^\/+/, "");
  const base = `${ORG_ROUTE_PREFIX}/${encodeURIComponent(organization)}`;
  return tail ? `${base}/${tail}` : base;
}

/** The organization alias carried by `pathname`, `undefined` outside the prefix. */
export function organizationFromPath(pathname: string): string | undefined {
  const match = ORG_PATH_PATTERN.exec(pathname);
  const alias = match?.[1];
  if (!alias) return undefined;
  try {
    return decodeURIComponent(alias);
  } catch {
    return alias;
  }
}

/** Drops the organization prefix: `/o/acme/connections` → `/connections`. */
export function stripOrgPath(pathname: string): string {
  const match = ORG_PATH_PATTERN.exec(pathname);
  if (!match) return pathname;
  return match[2] ?? "/";
}

/** The same view of the app in another organization — the org-switch target. */
export function switchOrgPath(organization: string, pathname: string): string {
  return orgPath(organization, stripOrgPath(pathname));
}

/**
 * Where an un-prefixed app path belongs now, or `undefined` when the path is
 * not one of the moved routes (a genuine 404 must stay a 404 rather than
 * redirecting in a loop).
 */
export function legacyRedirectPath(
  pathname: string,
  organization: string | undefined,
): string | undefined {
  if (!organization) return undefined;
  if (pathname === "/" || pathname === ORG_ROUTE_PREFIX || pathname === `${ORG_ROUTE_PREFIX}/`) {
    return orgPath(organization, "/");
  }
  const isLegacyPath = LEGACY_APP_PATHS.some(
    (legacyPath) => pathname === legacyPath || pathname.startsWith(`${legacyPath}/`),
  );
  return isLegacyPath ? orgPath(organization, pathname) : undefined;
}
