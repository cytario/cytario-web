import { beforeEach, describe, expect, test } from "vitest";

import { routeRegistry } from "~/.server/routeRegistry";
import { clientRouteRegistry } from "~/lib/clientRouteRegistry";

beforeEach(() => {
  clientRouteRegistry.__reset();
  routeRegistry.__reset();
});

describe("clientRouteRegistry (SDS-CY-010093 realm split)", () => {
  test("records an element contribution under an allowed prefix", () => {
    clientRouteRegistry.scopedFor("compute-plugin").register({
      path: "/plugin/jobs",
      element: () => null,
    });
    const entries = clientRouteRegistry.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].pluginName).toBe("compute-plugin");
  });

  test("findByPath resolves a registered contribution", () => {
    clientRouteRegistry.scopedFor("compute-plugin").register({
      path: "/plugin/analyze",
      element: () => null,
    });
    expect(clientRouteRegistry.findByPath("/plugin/analyze")?.pluginName).toBe("compute-plugin");
    expect(clientRouteRegistry.findByPath("/plugin/missing")).toBeUndefined();
  });

  test("is a separate instance from the server routeRegistry", () => {
    routeRegistry.scopedFor("compute-plugin").register({
      path: "/plugin/server-only",
      loader: async () => Response.json({ ok: true }),
    });
    expect(clientRouteRegistry.list()).toHaveLength(0);
    expect(routeRegistry.list()).toHaveLength(1);

    clientRouteRegistry.scopedFor("compute-plugin").register({
      path: "/plugin/client-only",
      element: () => null,
    });
    expect(clientRouteRegistry.list()).toHaveLength(1);
    expect(routeRegistry.list()).toHaveLength(1);
  });

  test("rejects a path outside the reserved-prefix allowlist", () => {
    expect(() =>
      clientRouteRegistry.scopedFor("evil-plugin").register({ path: "/admin/users" }),
    ).toThrow("reserved-prefix allowlist");
  });

  test("rejects a duplicate path across plugins", () => {
    clientRouteRegistry
      .scopedFor("plugin-a")
      .register({ path: "/plugin/shared", element: () => null });
    expect(() =>
      clientRouteRegistry
        .scopedFor("plugin-b")
        .register({ path: "/plugin/shared", element: () => null }),
    ).toThrow("already registered by plugin");
  });

  test("__reset drops all registrations", () => {
    clientRouteRegistry.scopedFor("plugin-a").register({ path: "/plugin/a", element: () => null });
    clientRouteRegistry.__reset();
    expect(clientRouteRegistry.list()).toHaveLength(0);
  });
});
