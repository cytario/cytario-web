// Host-side integration test for @cytario/plugin-api: registry
// round-trip, auto-derived FILE_TYPE_REGISTRY entry, apiVersion gate.
import noopPlugin, { NOOP_SENTINEL } from "./fixtures/noop-plugin";
import { IncompatiblePluginError, assertApiCompatible, hostApiVersion } from "@cytario/plugin-api";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";
import { getFileType, isImageFile } from "~/utils/fileType";

beforeEach(() => {
  formatRegistry.__reset();
});

describe("noop-plugin integration", () => {
  test("registers and resolves end-to-end via the scoped FormatRegistry", async () => {
    // Mirror what bootstrapPlugins does: build a scoped ctx, await register.
    assertApiCompatible(noopPlugin, hostApiVersion);
    const ctx = {
      formats: formatRegistry.scopedFor(noopPlugin.name),
      gates: { register: () => {} },
      slots: { register: () => {} },
      env: "server" as const,
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    };
    await noopPlugin.register(ctx);

    const url = "https://x/sample.noop";
    const { handler, pluginName, keys } = formatRegistry.resolve(url);
    expect(pluginName).toBe("noop-plugin");
    expect(keys).toEqual(["noop"]);

    const result = await handler.load(url, {
      signedFetch: vi.fn(),
    });
    expect(result.metadata.Description).toBe(NOOP_SENTINEL);
  });

  test("auto-derives FILE_TYPE_REGISTRY entry from the plugin name and default icon", async () => {
    assertApiCompatible(noopPlugin, hostApiVersion);
    await noopPlugin.register({
      formats: formatRegistry.scopedFor(noopPlugin.name),
      gates: { register: () => {} },
      slots: { register: () => {} },
      env: "server",
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    });

    expect(getFileType("anything.noop")).toBe("noop-plugin");
    expect(isImageFile("anything.noop")).toBe(true);
  });

  test("apiVersion gate rejects an incompatible plugin shape", () => {
    const incompatible = {
      ...noopPlugin,
      apiVersion: "^99.0.0",
    };
    expect(() => assertApiCompatible(incompatible, hostApiVersion)).toThrow(
      IncompatiblePluginError,
    );
  });
});
