import * as api from "../index";
import type { CytarioPlugin, PluginContext } from "../index";

describe("public surface", () => {
  test("exports expected runtime helpers", () => {
    expect(typeof api.assertApiCompatible).toBe("function");
    expect(typeof api.sanitizeHeaders).toBe("function");
    expect(typeof api.satisfies).toBe("function");
    expect(typeof api.hostApiVersion).toBe("string");
    expect(api.IncompatiblePluginError).toBeDefined();
  });

  test("hostApiVersion is a valid semver triple", () => {
    expect(api.hostApiVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("CytarioPlugin can be satisfied by a literal", () => {
    const plugin = {
      name: "noop",
      apiVersion: "^1.0.0",
      register(ctx: PluginContext) {
        ctx.formats.register("noop", {
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
      },
    } satisfies CytarioPlugin;
    expect(plugin.name).toBe("noop");
  });
});
