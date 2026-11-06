import { matchRoutes, type RouteObject } from "react-router";
import { describe, expect, test } from "vitest";

import routes from "../../routes";
import { RESERVED_PATH_ROOTS } from "../../utils/orgPath";

/** Route ids along the matched branch, or `null` when nothing matches. */
const match = (pathname: string): string[] | null => {
  // Route config entries carry `file` where react-router expects a component.
  const matched = matchRoutes(routes as unknown as RouteObject[], pathname);
  return matched ? matched.map((m) => (m.route as unknown as { file: string }).file) : null;
};

describe("route table", () => {
  test("organization-scoped views live under /:org", () => {
    expect(match("/acme")).toEqual([
      "routes/layouts/protected.layout.tsx",
      "routes/layouts/org.layout.tsx",
      "routes/connections/connections.route.tsx",
    ]);
    expect(match("/acme/abc/a/b")).toContain("routes/objects/objects.route.tsx");
    expect(match("/acme/admin/users")).toContain("routes/admin/users/users.route.tsx");
    expect(match("/acme/plugin/jobs")).toContain("routes/plugin/plugin.$.tsx");
    expect(match("/acme/recent")).toContain("routes/recent/recent.route.tsx");
  });

  test("the organization layout carries the URL-to-session reconciliation", () => {
    const matched = matchRoutes(routes as unknown as RouteObject[], "/acme/recent") ?? [];

    expect(matched.map((m) => (m.route as unknown as { file: string }).file)).toContain(
      "routes/layouts/org.layout.tsx",
    );
  });

  test("reserved top-level routes stay platform routes, never organizations", () => {
    expect(match("/login")).toEqual(["routes/auth/login.route.tsx"]);
    expect(match("/onboarding")).toEqual(["routes/onboarding.route.tsx"]);
    expect(match("/api/broker")).toEqual(["routes/api/broker.ts"]);
    // Un-prefixed app paths are NOT organizations: the router's /:org
    // catch-all still matches them, and the org layout's membership check
    // redirects — never a platform route render.
    expect(match("/recent")).toContain("routes/layouts/org.layout.tsx");
  });

  test("org-agnostic plugin dispatch stays un-prefixed; org-scoped under /api/v1/:org", () => {
    expect(match("/api/plugin/reconcile")).toEqual(["routes/api/plugin.$.ts"]);
    expect(match("/api/v1/acme/plugin/run")).toEqual(["routes/api/plugin.$.ts"]);
    expect(match("/api/v1/acme/provider-catalog")).toEqual(["routes/api/provider-catalog.ts"]);
    expect(match("/api/v1/acme/bucket-catalog")).toEqual(["routes/api/bucket-catalog.ts"]);
    expect(match("/api/v1/acme/job-grant/initiate")).toEqual(["routes/api/job-grant/initiate.ts"]);
    // The callback stays un-prefixed: the Keycloak job-broker client
    // registers exactly that one redirect URI, and the acting org comes from
    // the pending submission, not the URL.
    expect(match("/api/job-grant/callback")).toEqual(["routes/api/job-grant/callback.ts"]);
  });

  test("un-prefixed legacy app paths land in the org subtree, not a platform route", () => {
    // The redirect layer was deleted: not enough active users to keep the
    // compatibility surface. The router's /:org catch-all still matches
    // these paths, where the membership check rejects the "org" and redirects
    // to the user's default org root — old bookmarks bounce home rather
    // than 404ing, which is the cheapest correct degradation.
    for (const path of [
      "/connections",
      "/connections/abc/a/b",
      "/recent",
      "/favorites",
      "/config",
      "/admin/users",
      "/plugin/jobs",
    ]) {
      expect(match(path)).toContain("routes/layouts/org.layout.tsx");
    }
    // The bare root reaches the authed default-org redirect, not the fallback.
    expect(match("/")).toContain("routes/rootRedirect.route.ts");
  });

  test("an org path with no matching sub-route renders the object browser's 404 surface", () => {
    // Every `/:org/:id/…` path is the object browser; the org layout is its
    // mount, so an unknown org name is served by the org subtree (which
    // reconciles the alias against the session and redirects), never the
    // root fallback. The fallback stays for paths outside both namespaces.
    expect(match("/nonsense/deeper/still")).not.toContain("routes/fallback.route.tsx");
  });
});

describe("reserved top-level names cover the route table", () => {
  test("every static first path segment is a reserved root, so an org can never shadow it", () => {
    // An org named after a static route could never be reached — the router
    // resolves the static path first. Alias creation (admin-portal) refuses
    // these names; this pins the web side of that shared contract.
    const staticRoots = new Set<string>();
    for (const routeConfig of routes as unknown as { path?: string }[]) {
      const path = routeConfig.path;
      if (!path || path.includes(":") || path === "/" || path === "*") continue;
      const first = `/${path.split("/").filter(Boolean)[0]}`;
      staticRoots.add(first);
    }

    for (const root of staticRoots) {
      expect(RESERVED_PATH_ROOTS).toContain(root);
    }
  });
});
