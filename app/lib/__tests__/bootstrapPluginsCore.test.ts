import { bootstrapPluginsCore } from "../bootstrapPluginsCore";
import type {
  CytarioPlugin,
  ContextMenuRegistry,
  GateRegistry,
  HostCapabilities,
  Logger,
  PluginContext,
  RouteRegistry,
  ServerEndpointRegistry,
  SidebarNavRegistry,
  SlotRegistry,
} from "@cytario/plugin-api";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";

const noopLogger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

beforeEach(() => {
  formatRegistry.__reset();
});

describe("bootstrapPluginsCore (SDS-CY-010403)", () => {
  test("a plugin whose register() throws does not stop subsequent plugins", async () => {
    const logger = noopLogger();

    const bad: CytarioPlugin = {
      name: "bad-plugin",
      apiVersion: "^4.0.0",
      register() {
        throw new Error("intentional failure");
      },
    };

    const goodRegistered = vi.fn((ctx: PluginContext) => {
      ctx.formats.register("good", {
        load: async () => ({
          data: [],
          metadata: {
            Pixels: {
              Type: "Uint8",
              Channels: [],
              SizeX: 0,
              SizeY: 0,
              PhysicalSizeXUnit: "",
              PhysicalSizeYUnit: "",
              PhysicalSizeZUnit: "",
            },
          },
        }),
      });
    });
    const good: CytarioPlugin = {
      name: "good-plugin",
      apiVersion: "^4.0.0",
      register: goodRegistered,
    };

    await bootstrapPluginsCore([bad, good], logger);

    // Good plugin still registered despite the bad plugin throwing.
    expect(goodRegistered).toHaveBeenCalledTimes(1);
    expect(formatRegistry.list().some((r) => r.pluginName === "good-plugin")).toBe(true);

    // Error logged exactly once for the bad plugin.
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("bad-plugin"),
      expect.objectContaining({ error: expect.stringContaining("intentional") }),
    );
  });

  test("apiVersion mismatch skips the plugin and logs once", async () => {
    const logger = noopLogger();
    const incompatible: CytarioPlugin = {
      name: "old-plugin",
      apiVersion: "^99.0.0",
      register: vi.fn(),
    };

    await bootstrapPluginsCore([incompatible], logger);

    expect(incompatible.register).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Skipping incompatible plugin"),
      expect.objectContaining({ error: expect.stringContaining("99.0.0") }),
    );
  });

  test("each plugin receives a PluginContext scoped to its own name", async () => {
    const logger = noopLogger();
    const captured: string[] = [];

    const collisionFirst: CytarioPlugin = {
      name: "first",
      apiVersion: "^4.0.0",
      register(ctx) {
        captured.push("first");
        ctx.formats.register("shared", {
          load: async () =>
            ({
              data: [],
              metadata: {
                Pixels: {
                  Type: "Uint8",
                  Channels: [],
                  SizeX: 0,
                  SizeY: 0,
                  PhysicalSizeXUnit: "",
                  PhysicalSizeYUnit: "",
                  PhysicalSizeZUnit: "",
                },
              },
            }) as never,
        });
      },
    };
    const collisionSecond: CytarioPlugin = {
      name: "second",
      apiVersion: "^4.0.0",
      register(ctx) {
        captured.push("second");
        // Same extension as `first` → must throw DuplicateRegistrationError
        // inside register, which the bootstrap catches.
        ctx.formats.register("shared", {
          load: async () =>
            ({
              data: [],
              metadata: {
                Pixels: {
                  Type: "Uint8",
                  Channels: [],
                  SizeX: 0,
                  SizeY: 0,
                  PhysicalSizeXUnit: "",
                  PhysicalSizeYUnit: "",
                  PhysicalSizeZUnit: "",
                },
              },
            }) as never,
        });
      },
    };

    await bootstrapPluginsCore([collisionFirst, collisionSecond], logger);

    expect(captured).toEqual(["first", "second"]);
    expect(formatRegistry.list()).toHaveLength(1);
    expect(formatRegistry.list()[0].pluginName).toBe("first");
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Plugin "second"'),
      expect.objectContaining({
        error: expect.stringContaining("collides"),
      }),
    );
  });

  describe("registry injection", () => {
    const captureContext = (sink: { ctx?: PluginContext }): CytarioPlugin => ({
      name: "capture-plugin",
      apiVersion: "^4.0.0",
      register(ctx) {
        sink.ctx = ctx;
      },
    });

    test("injects the gate registry scoped to the plugin name; env is server", async () => {
      const sink: { ctx?: PluginContext } = {};
      const scoped: GateRegistry = { register: vi.fn() };
      const gates = { scopedFor: vi.fn(() => scoped) };

      await bootstrapPluginsCore([captureContext(sink)], noopLogger(), {
        gates,
        env: "server",
      });

      expect(gates.scopedFor).toHaveBeenCalledWith("capture-plugin");
      expect(sink.ctx?.gates).toBe(scoped);
      expect(sink.ctx?.env).toBe("server");
    });

    test("injects the slot registry scoped to the plugin name; env is client", async () => {
      const sink: { ctx?: PluginContext } = {};
      const scoped: SlotRegistry = { register: vi.fn() };
      const slots = { scopedFor: vi.fn(() => scoped) };

      await bootstrapPluginsCore([captureContext(sink)], noopLogger(), {
        slots,
        env: "client",
      });

      expect(slots.scopedFor).toHaveBeenCalledWith("capture-plugin");
      expect(sink.ctx?.slots).toBe(scoped);
      expect(sink.ctx?.env).toBe("client");
    });

    test("injects the context-menu registry scoped to the plugin name; env is client", async () => {
      const sink: { ctx?: PluginContext } = {};
      const scoped: ContextMenuRegistry = { register: vi.fn() };
      const contextMenus = { scopedFor: vi.fn(() => scoped) };

      await bootstrapPluginsCore([captureContext(sink)], noopLogger(), {
        contextMenus,
        env: "client",
      });

      expect(contextMenus.scopedFor).toHaveBeenCalledWith("capture-plugin");
      expect(sink.ctx?.contextMenus).toBe(scoped);
      expect(sink.ctx?.env).toBe("client");
    });

    test("injects the sidebar-nav registry scoped to the plugin name; env is client", async () => {
      const sink: { ctx?: PluginContext } = {};
      const scoped: SidebarNavRegistry = { register: vi.fn() };
      const sidebarNav = { scopedFor: vi.fn(() => scoped) };

      await bootstrapPluginsCore([captureContext(sink)], noopLogger(), {
        sidebarNav,
        env: "client",
      });

      expect(sidebarNav.scopedFor).toHaveBeenCalledWith("capture-plugin");
      expect(sink.ctx?.sidebarNav).toBe(scoped);
      expect(sink.ctx?.env).toBe("client");
    });

    test("injects the route registry scoped to the plugin name; env is server", async () => {
      const sink: { ctx?: PluginContext } = {};
      const scoped: RouteRegistry = { register: vi.fn() };
      const routes = { scopedFor: vi.fn(() => scoped) };

      await bootstrapPluginsCore([captureContext(sink)], noopLogger(), {
        routes,
        env: "server",
      });

      expect(routes.scopedFor).toHaveBeenCalledWith("capture-plugin");
      expect(sink.ctx?.routes).toBe(scoped);
      expect(sink.ctx?.env).toBe("server");
    });

    test("injects the server-endpoint registry scoped to the plugin name; env is server", async () => {
      const sink: { ctx?: PluginContext } = {};
      const scoped: ServerEndpointRegistry = { register: vi.fn() };
      const serverEndpoints = { scopedFor: vi.fn(() => scoped) };

      await bootstrapPluginsCore([captureContext(sink)], noopLogger(), {
        serverEndpoints,
        env: "server",
      });

      expect(serverEndpoints.scopedFor).toHaveBeenCalledWith("capture-plugin");
      expect(sink.ctx?.serverEndpoints).toBe(scoped);
      expect(sink.ctx?.env).toBe("server");
    });

    test("injects the host capabilities object as-is (not scoped); env is server", async () => {
      const sink: { ctx?: PluginContext } = {};
      const host: HostCapabilities = {
        connections: vi.fn(),
        computeConnections: vi.fn(),
        catalogConnections: vi.fn(),
        connectionFetch: vi.fn(),
        objectStore: vi.fn(),
        assumeComputeRole: vi.fn(),
        exchangeToken: vi.fn(),
        revokeGrant: vi.fn(),
        jobLedger: vi.fn(),
      };

      await bootstrapPluginsCore([captureContext(sink)], noopLogger(), {
        host,
        env: "server",
      });

      expect(sink.ctx?.host).toBe(host);
      expect(sink.ctx?.env).toBe("server");
    });

    test("no-op sinks are supplied when registries are not injected", async () => {
      const sink: { ctx?: PluginContext } = {};

      await bootstrapPluginsCore([captureContext(sink)], noopLogger());

      // No-op sinks: registering against them is inert and does not throw.
      expect(() => sink.ctx?.gates.register(() => ({ kind: "continue" }))).not.toThrow();
      expect(() => sink.ctx?.slots.register("app-overlay", () => null)).not.toThrow();
      expect(() =>
        sink.ctx?.contextMenus.register("s3-node", {
          id: "x",
          label: "x",
          onActivate: () => {},
        }),
      ).not.toThrow();
      expect(() =>
        sink.ctx?.sidebarNav.register("nav", {
          id: "x",
          label: "x",
          to: "/x",
        }),
      ).not.toThrow();
      expect(() => sink.ctx?.routes.register({ path: "/x" })).not.toThrow();
      expect(() =>
        sink.ctx?.serverEndpoints.register({
          path: "/x",
          auth: "session",
          loader: async () => new Response(),
        }),
      ).not.toThrow();
      // Host no-op sink rejects on call (server-only capabilities).
      await expect(sink.ctx?.host.connections()).rejects.toThrow("server-only");
      await expect(sink.ctx?.host.computeConnections()).rejects.toThrow("server-only");
      await expect(sink.ctx?.host.catalogConnections()).rejects.toThrow("server-only");
      // env defaults to client for backward compatibility.
      expect(sink.ctx?.env).toBe("client");
    });
  });
});
