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
  test("organization-scoped views live under /o/:org", () => {
    expect(match("/o/acme/connections")).toEqual([
      "routes/layouts/protected.layout.tsx",
      "routes/layouts/org.layout.tsx",
      "routes/connections/connections.layout.tsx",
      "routes/connections/connections.route.tsx",
    ]);
    expect(match("/o/acme/connections/abc/a/b")).toContain("routes/objects/objects.route.tsx");
    expect(match("/o/acme/admin/users")).toContain("routes/admin/users/users.route.tsx");
    expect(match("/o/acme/plugin/jobs")).toContain("routes/plugin/plugin.$.tsx");
  });

  test("the organization layout carries the URL-to-session reconciliation", () => {
    const matched = matchRoutes(routes as unknown as RouteObject[], "/o/acme/recent") ?? [];

    expect(matched.map((m) => (m.route as unknown as { file: string }).file)).toContain(
      "routes/layouts/org.layout.tsx",
    );
  });

  test("api routes stay un-prefixed — the org comes from the session", () => {
    expect(match("/api/broker")).toEqual(["routes/api/broker.ts"]);
    expect(match("/api/plugin/run")).toEqual(["routes/api/plugin.$.ts"]);
  });

  test("auth routes stay un-prefixed", () => {
    expect(match("/login")).toEqual(["routes/auth/login.route.tsx"]);
    expect(match("/onboarding")).toEqual(["routes/onboarding.route.tsx"]);
  });

  test("un-prefixed app paths reach the legacy redirect, not the 404 fallback", () => {
    for (const path of [
      "/",
      "/o",
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
    for (const path of [
      "/o/acme",
      "/o/acme/recent",
      "/o/acme/admin/users",
      "/o/acme/plugin/jobs",
    ]) {
      expect(match(path)).not.toContain(LEGACY_REDIRECT);
    }
  });

  test("an unrelated path stays a 404", () => {
    expect(match("/nonsense")).toEqual(["routes/fallback.route.tsx"]);
  });
});
