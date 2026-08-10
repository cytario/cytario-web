import { serverEndpointRegistry } from "../serverEndpointRegistry";

beforeEach(() => {
  serverEndpointRegistry.__reset();
});

describe("ServerEndpointRegistryImpl (SDS-CY-010094/010095)", () => {
  test("registers a session-authenticated endpoint", () => {
    const scoped = serverEndpointRegistry.scopedFor("compute-plugin");
    scoped.register({
      path: "/api/plugin/catalog",
      auth: "session",
      loader: async () => Response.json({ ok: true }),
    });
    const entries = serverEndpointRegistry.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].contribution.auth).toBe("session");
  });

  test("registers a job-token-authenticated carve-out endpoint", () => {
    const scoped = serverEndpointRegistry.scopedFor("compute-plugin");
    scoped.register({
      path: "/api/plugin/credential-broker",
      auth: "job-token",
      action: async () => Response.json({ ok: true }),
    });
    expect(serverEndpointRegistry.list()[0].contribution.auth).toBe("job-token");
  });

  test("registers a webhook-secret carve-out endpoint", () => {
    const scoped = serverEndpointRegistry.scopedFor("compute-plugin");
    scoped.register({
      path: "/api/plugin/catalog-cache-webhook",
      auth: "webhook-secret",
      loader: async () => Response.json({ ok: true }),
    });
    expect(serverEndpointRegistry.list()[0].contribution.auth).toBe("webhook-secret");
  });

  test("registers a deployment-secret carve-out endpoint", () => {
    const scoped = serverEndpointRegistry.scopedFor("compute-plugin");
    scoped.register({
      path: "/api/plugin/job-reconciliation",
      auth: "deployment-secret",
      action: async () => Response.json({ ok: true }),
    });
    expect(serverEndpointRegistry.list()[0].contribution.auth).toBe("deployment-secret");
  });

  test("rejects an endpoint with neither loader nor action", () => {
    const scoped = serverEndpointRegistry.scopedFor("bad-plugin");
    expect(() => scoped.register({ path: "/api/plugin/empty", auth: "session" })).toThrow(
      "neither a loader nor an action",
    );
  });

  test("rejects an unknown auth mode", () => {
    const scoped = serverEndpointRegistry.scopedFor("bad-plugin");
    expect(() =>
      scoped.register({
        path: "/api/plugin/x",
        auth: "unknown" as never,
        loader: async () => new Response(),
      }),
    ).toThrow("unknown auth mode");
  });

  test("rejects a path that does not start with /", () => {
    const scoped = serverEndpointRegistry.scopedFor("bad-plugin");
    expect(() =>
      scoped.register({
        path: "api/plugin/x",
        auth: "session",
        loader: async () => new Response(),
      }),
    ).toThrow('does not start with "/"');
  });

  test("rejects a path containing a ':' path-param segment", () => {
    const scoped = serverEndpointRegistry.scopedFor("compute-plugin");
    expect(() =>
      scoped.register({
        path: "/api/plugin/catalog/:appId",
        auth: "session",
        loader: async () => new Response(),
      }),
    ).toThrow('containing a ":" path-param segment');
  });

  test("rejects a path outside the reserved-prefix allowlist", () => {
    const scoped = serverEndpointRegistry.scopedFor("evil-plugin");
    expect(() =>
      scoped.register({
        path: "/api/connections",
        auth: "session",
        loader: async () => new Response(),
      }),
    ).toThrow("reserved-prefix allowlist");
    expect(() =>
      scoped.register({
        path: "/admin/users",
        auth: "session",
        loader: async () => new Response(),
      }),
    ).toThrow("reserved-prefix allowlist");
  });

  test("rejects a duplicate path across plugins", () => {
    serverEndpointRegistry.scopedFor("plugin-a").register({
      path: "/api/plugin/shared",
      auth: "session",
      loader: async () => new Response(),
    });
    expect(() =>
      serverEndpointRegistry.scopedFor("plugin-b").register({
        path: "/api/plugin/shared",
        auth: "session",
        loader: async () => new Response(),
      }),
    ).toThrow("already registered by plugin");
  });

  test("__reset drops all registrations", () => {
    serverEndpointRegistry.scopedFor("plugin-a").register({
      path: "/api/plugin/a",
      auth: "session",
      loader: async () => new Response(),
    });
    serverEndpointRegistry.__reset();
    expect(serverEndpointRegistry.list()).toHaveLength(0);
  });
});
