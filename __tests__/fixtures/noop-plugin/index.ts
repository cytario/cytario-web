/**
 * Stub CytarioPlugin used by the host-side integration test. Exercises
 * the registry, FILE_TYPE_REGISTRY auto-derivation, and the apiVersion
 * gate. Format-loader contract conformance is verified in each plugin
 * package's own test suite, not here.
 */
import type { CytarioPlugin } from "@cytario/plugin-api";

export const NOOP_SENTINEL = "noop-sentinel" as const;

const noopPlugin: CytarioPlugin = {
  name: "noop-plugin",
  apiVersion: "^1.0.0",
  register(ctx) {
    ctx.formats.register("noop", {
      match: (url) => url.endsWith(".noop"),
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
          // Tag the metadata with a sentinel so the integration test can
          // assert the round-trip without committing to any real loader
          // semantics.
          Description: NOOP_SENTINEL,
        },
      }),
    });
  },
};

export default noopPlugin;
