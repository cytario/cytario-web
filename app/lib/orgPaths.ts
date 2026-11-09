import type { OrgPathHelpers } from "@cytario/plugin-api";
import { orgPath } from "~/utils/orgPath";

/**
 * The org the current browser page acts in: the URL's `/:org` segment (page
 * routes) or `/api/v1/:org` (data routes), else undefined outside an
 * org-prefixed context. Client realm only — the server realm's capability is
 * null and plugins use their request context instead.
 */
function currentOrg(): string | undefined {
  const { pathname } = window.location;
  const apiMatch = /^\/api\/v1\/([^/]+)(?:\/|$)/.exec(pathname);
  if (apiMatch) return decodeURIComponent(apiMatch[1]);
  const pageMatch = /^\/([^/]+)(?:\/|$)/.exec(pathname);
  if (!pageMatch) return undefined;
  const alias = decodeURIComponent(pageMatch[1]);
  try {
    return RESERVED.has(alias) ? undefined : alias;
  } catch {
    return undefined;
  }
}

// The same reserved roots the host's orgPath module guards with; duplicated
// small because plugin-api must stay framework-free of host internals.
const RESERVED = new Set([
  "login",
  "logout",
  "auth",
  "onboarding",
  "api",
  "recent",
  "favorites",
  "config",
  "connections",
  "admin",
  "plugin",
  "agent",
]);

/** Host-provided org-aware URL builders for plugin client code. */
export const orgPaths: OrgPathHelpers = {
  api(path: string): string {
    const org = currentOrg();
    return org ? `/api/v1/${encodeURIComponent(org)}${path}` : path;
  },
  page(path: string): string {
    const org = currentOrg();
    return org ? orgPath(org, path) : path;
  },
  plugin(path: string): string {
    const org = currentOrg();
    return org ? `/api/v1/${encodeURIComponent(org)}/plugin${path}` : path;
  },
};
