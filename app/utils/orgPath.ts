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
  // Strip the single-fetch suffix first so the reserved-root check and the
  // alias read see the same pathname: `/recent.data` must resolve to the
  // reserved `/recent`, not to an org alias "recent.data"-adjacent shape.
  const documentPathname = stripSingleFetchSuffix(pathname);
  const match = ORG_PATH_PATTERN.exec(documentPathname);
  const alias = match?.[1];
  if (!alias || isReservedRoot(documentPathname)) return undefined;
  try {
    return decodeURIComponent(alias);
  } catch {
    return alias;
  }
}

/** Drops the organization prefix: `/acme/recent` → `/recent`. */
export function stripOrgPath(pathname: string): string {
  if (!organizationFromPath(pathname)) return pathname;
  const match = ORG_PATH_PATTERN.exec(stripSingleFetchSuffix(pathname));
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
 * React Router's single-fetch revalidation suffixes the pathname: a client
 * navigation to `/second` revalidates against `/second.data`, one to
 * `/second/` against `/second/_.data`. The org segment is the DOCUMENT url's
 * first segment, so strip the suffix before any org extraction — otherwise
 * the alias reads as `second.data` and the org projection falls through to
 * the org-neutral profile (empty groups/scopes for the client chrome).
 */
export function stripSingleFetchSuffix(pathname: string): string {
  return pathname.replace(/(\/?)_?\.data$/, "");
}

/**
 * The org carried by an org-scoped API path (`/api/v1/{org}/...`), undefined
 * for any other shape. `api` and `v1` are structural segments here, never
 * organizations — an org named `v1` is impossible (the reserved-name
 * contract covers it) and the read only ever looks at this position.
 */
export function organizationFromApiPath(pathname: string): string | undefined {
  const match = /^\/api\/v1\/([^/]+)(?:\/|$)/.exec(pathname);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
