import { bootstrapPluginsCore } from "../bootstrapPluginsCore";
import type { CytarioPlugin, Logger, PluginContext } from "@cytario/plugin-api";
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
      apiVersion: "^2.0.0",
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
      apiVersion: "^2.0.0",
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
      apiVersion: "^2.0.0",
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
      apiVersion: "^2.0.0",
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
});
