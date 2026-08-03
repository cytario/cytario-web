import { routeRegistry } from "../routeRegistry";

beforeEach(() => {
  routeRegistry.__reset();
});

describe("RouteRegistryImpl (SDS-CY-010093)", () => {
  test("registers a route under an allowed prefix", () => {
    const scoped = routeRegistry.scopedFor("compute-plugin");
    scoped.register({ path: "/plugin/jobs" });
    const entries = routeRegistry.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].pluginName).toBe("compute-plugin");
    expect(entries[0].contribution.path).toBe("/plugin/jobs");
  });

  test("rejects a path outside the reserved-prefix allowlist", () => {
    const scoped = routeRegistry.scopedFor("evil-plugin");
    expect(() => scoped.register({ path: "/connections" })).toThrow("reserved-prefix allowlist");
    expect(() => scoped.register({ path: "/admin/users" })).toThrow("reserved-prefix allowlist");
    expect(routeRegistry.list()).toHaveLength(0);
  });

  test("rejects a path that does not start with /", () => {
    const scoped = routeRegistry.scopedFor("bad-plugin");
    expect(() => scoped.register({ path: "plugin/jobs" })).toThrow('does not start with "/"');
  });

  test("rejects a missing or empty path", () => {
    const scoped = routeRegistry.scopedFor("bad-plugin");
    expect(() => scoped.register({ path: "" })).toThrow("missing or empty path");
    expect(() => scoped.register({ path: "  " })).toThrow("does not start with");
  });

  test("rejects a non-object contribution", () => {
    const scoped = routeRegistry.scopedFor("bad-plugin");
    expect(() => scoped.register(null as never)).toThrow("non-object");
  });

  test("rejects a duplicate path within the same plugin", () => {
    const scoped = routeRegistry.scopedFor("compute-plugin");
    scoped.register({ path: "/plugin/jobs" });
    expect(() => scoped.register({ path: "/plugin/jobs" })).toThrow("duplicate route path");
  });

  test("rejects a duplicate path across plugins", () => {
    routeRegistry.scopedFor("plugin-a").register({ path: "/plugin/shared" });
    expect(() => routeRegistry.scopedFor("plugin-b").register({ path: "/plugin/shared" })).toThrow(
      "already registered by plugin",
    );
  });

  test("allows different paths from different plugins", () => {
    routeRegistry.scopedFor("plugin-a").register({ path: "/plugin/a" });
    routeRegistry.scopedFor("plugin-b").register({ path: "/plugin/b" });
    expect(routeRegistry.list()).toHaveLength(2);
  });

  test("list returns a snapshot (immutable)", () => {
    const scoped = routeRegistry.scopedFor("compute-plugin");
    scoped.register({ path: "/plugin/jobs" });
    const snapshot = routeRegistry.list();
    scoped.register({ path: "/plugin/catalog" });
    expect(snapshot).toHaveLength(1);
    expect(routeRegistry.list()).toHaveLength(2);
  });

  test("__reset drops all registrations", () => {
    routeRegistry.scopedFor("plugin-a").register({ path: "/plugin/a" });
    routeRegistry.__reset();
    expect(routeRegistry.list()).toHaveLength(0);
  });
});
