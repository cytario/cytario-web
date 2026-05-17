import { __resetBuiltinFormats, registerBuiltinFormats } from "../builtins";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";

// Loaders are imported by builtins.ts; mock them so we can assert that the
// registry routes URLs to the right one without doing real S3 work.
vi.mock("../../loaders/loadOmeTiffWithCredentials", () => ({
  loadOmeTiffWithCredentials: vi.fn(async () => ({
    data: [],
    metadata: {} as never,
  })),
}));

vi.mock("../../loaders/loadBioformatsZarrWithCredentials", () => ({
  loadBioformatsZarrWithCredentials: vi.fn(async () => ({
    data: [],
    metadata: {} as never,
  })),
}));

beforeEach(() => {
  formatRegistry.__reset();
  __resetBuiltinFormats();
});

describe("registerBuiltinFormats", () => {
  test("registers OME-TIFF and OME-Zarr under cytario-web with aliases", () => {
    registerBuiltinFormats();
    const regs = formatRegistry.list();
    expect(regs).toHaveLength(2);
    const allKeys = regs.flatMap((r) => r.keys).sort();
    expect(allKeys).toEqual(["ome.tif", "ome.tiff", "ome.zarr", "zarr"]);
    for (const r of regs) {
      expect(r.pluginName).toBe("cytario-web");
    }
  });

  test("idempotent: calling twice does not throw and does not duplicate", () => {
    registerBuiltinFormats();
    expect(() => registerBuiltinFormats()).not.toThrow();
    expect(formatRegistry.list()).toHaveLength(2);
  });
});

describe("FormatRegistry.resolve with built-ins", () => {
  beforeEach(() => {
    registerBuiltinFormats();
  });

  test.each(["https://x/a.ome.tif", "https://x/a.ome.tiff", "https://x/A.OME.TIF"])(
    "%s routes to the OME-TIFF handler",
    (url) => {
      expect(formatRegistry.resolve(url).keys).toEqual(["ome.tif", "ome.tiff"]);
    },
  );

  test.each([
    "https://x/a.zarr",
    "https://x/a.zarr/",
    "https://x/a.ome.zarr",
    "https://x/a.ome.zarr/",
  ])("%s routes to the OME-Zarr handler", (url) => {
    expect(formatRegistry.resolve(url).keys).toEqual(["ome.zarr", "zarr"]);
  });

  test("forwards signal and signedFetch to the resolved handler", async () => {
    const { handler } = formatRegistry.resolve("https://x/a.ome.tif");
    const signedFetch = vi.fn();
    const controller = new AbortController();
    await handler.load("https://x/a.ome.tif", {
      signedFetch,
      signal: controller.signal,
    });
    const { loadOmeTiffWithCredentials } = await import("../../loaders/loadOmeTiffWithCredentials");
    expect(loadOmeTiffWithCredentials).toHaveBeenCalledWith(
      "https://x/a.ome.tif",
      expect.objectContaining({ signedFetch, signal: controller.signal }),
    );
  });
});
