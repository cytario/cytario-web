import { matchRoutes, type RouteObject } from "react-router";
import { describe, expect, test } from "vitest";

import routes from "../../routes";

/** Route ids along the matched branch, or `null` when nothing matches. */
const match = (pathname: string): string[] | null => {
  // Route config entries carry `file` where react-router expects a component.
  const matched = matchRoutes(routes as unknown as RouteObject[], pathname);
  return matched ? matched.map((m) => (m.route as unknown as { file: string }).file) : null;
};

const LEGACY_REDIRECT = "routes/layouts/legacyRedirect.layout.ts";

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
    expect(match("/recent")).toContain(LEGACY_REDIRECT);
  });

  test("api routes stay un-prefixed — the org comes from the session", () => {
    expect(match("/api/plugin/run")).toEqual(["routes/api/plugin.$.ts"]);
  });

  test("un-prefixed app paths reach the legacy redirect, not the 404 fallback", () => {
    for (const path of [
      "/",
      "/connections",
      "/connections/abc/a/b",
      "/recent",
      "/favorites",
      "/config",
      "/admin/users",
      "/plugin/jobs",
    ]) {
      expect(match(path)).toContain(LEGACY_REDIRECT);
    }
  });

  test("the legacy redirect never shadows an organization-scoped route", () => {
    for (const path of ["/acme", "/acme/recent", "/acme/admin/users", "/acme/plugin/jobs"]) {
      expect(match(path)).not.toContain(LEGACY_REDIRECT);
    }
  });

  test("an org path with no matching sub-route renders the object browser's 404 surface", () => {
    // Every `/:org/:id/…` path is the object browser; the org layout is its
    // mount, so an unknown org name is served by the org subtree (which
    // reconciles the alias against the session and redirects), never the
    // root fallback. The fallback stays for paths outside both namespaces.
    expect(match("/nonsense/deeper/still")).not.toContain("routes/fallback.route.tsx");
  });
});
