import { DuplicateRegistrationError, UnknownFormatError, formatRegistry } from "../formatRegistry";
import type { FormatHandler } from "@cytario/plugin-api";

const stubHandler = (overrides: Partial<FormatHandler> = {}): FormatHandler => ({
  load: async () => ({
    data: [],
    metadata: {
      Pixels: {
        Type: "Uint8" as const,
        Channels: [],
        SizeX: 0,
        SizeY: 0,
        PhysicalSizeXUnit: "",
        PhysicalSizeYUnit: "",
        PhysicalSizeZUnit: "",
      },
    },
  }),
  ...overrides,
});

beforeEach(() => {
  formatRegistry.__reset();
});

describe("FormatRegistry.add", () => {
  test("registers a string extension and exposes it via list()", () => {
    formatRegistry.add("p1", "foo", stubHandler());
    expect(formatRegistry.list()).toHaveLength(1);
    expect(formatRegistry.list()[0]).toMatchObject({
      keys: ["foo"],
      pluginName: "p1",
    });
  });

  test("lowercases extension and strips leading dot", () => {
    formatRegistry.add("p1", ".FoO", stubHandler());
    expect(formatRegistry.list()[0].keys).toEqual(["foo"]);
  });

  test("accepts an array of aliases under a single handler", () => {
    formatRegistry.add("p1", ["ome.tif", ".OME.TIFF"], stubHandler());
    expect(formatRegistry.list()[0].keys).toEqual(["ome.tif", "ome.tiff"]);
  });

  test("accepts a RegExp as the extension declaration", () => {
    const re = /^dicom:/i;
    formatRegistry.add("p1", re, stubHandler());
    expect(formatRegistry.list()[0].keys).toEqual([re]);
  });

  test("same-plugin re-registration of the same keys is a no-op", () => {
    const h = stubHandler();
    formatRegistry.add("p1", "foo", h);
    formatRegistry.add("p1", "foo", h);
    expect(formatRegistry.list()).toHaveLength(1);
  });

  test("cross-plugin collision on a string key throws", () => {
    formatRegistry.add("p1", "foo", stubHandler());
    expect(() => formatRegistry.add("p2", "foo", stubHandler())).toThrow(
      DuplicateRegistrationError,
    );
  });

  test("cross-plugin collision on any string in an alias array throws", () => {
    formatRegistry.add("p1", ["foo", "bar"], stubHandler());
    expect(() => formatRegistry.add("p2", ["baz", "bar"], stubHandler())).toThrow(
      DuplicateRegistrationError,
    );
  });

  test("cross-plugin collision on a structurally equal regex throws", () => {
    formatRegistry.add("p1", /\.zarr(\/|$|\?)/, stubHandler());
    expect(() => formatRegistry.add("p2", /\.zarr(\/|$|\?)/, stubHandler())).toThrow(
      DuplicateRegistrationError,
    );
  });

  test("string keys and regex keys do not collide structurally", () => {
    formatRegistry.add("p1", "zarr", stubHandler());
    // Regex coverage overlaps but the keys are not structurally equal,
    // so the host accepts the registration; documented behaviour.
    expect(() => formatRegistry.add("p2", /\.zarr$/, stubHandler())).not.toThrow();
  });
});

describe("FormatRegistry.resolve", () => {
  test("falls through to extension-string lookup", () => {
    const h = stubHandler();
    formatRegistry.add("p1", "foo", h);
    expect(formatRegistry.resolve("https://x/sample.foo").handler).toBe(h);
  });

  test("compound extensions resolve via getExtension", () => {
    const h = stubHandler();
    formatRegistry.add("p1", "ome.tif", h);
    expect(formatRegistry.resolve("https://x/a.ome.tif").handler).toBe(h);
  });

  test("alias array matches every aliased extension", () => {
    const h = stubHandler();
    formatRegistry.add("p1", ["ome.tif", "ome.tiff"], h);
    expect(formatRegistry.resolve("https://x/a.ome.tif").handler).toBe(h);
    expect(formatRegistry.resolve("https://x/a.ome.tiff").handler).toBe(h);
  });

  test("regex keys test against the original URL (query string preserved)", () => {
    const h = stubHandler();
    formatRegistry.add("p1", /\?sig=abc$/, h);
    expect(formatRegistry.resolve("https://x/a?sig=abc").handler).toBe(h);
  });

  test("string keys ignore query string and trailing slash", () => {
    const h = stubHandler();
    formatRegistry.add("p1", "zarr", h);
    expect(formatRegistry.resolve("https://x/a.zarr/").handler).toBe(h);
    expect(formatRegistry.resolve("https://x/a.zarr?sig=xyz").handler).toBe(h);
  });

  test("throws UnknownFormatError when no key matches", () => {
    formatRegistry.add("p1", "foo", stubHandler());
    expect(() => formatRegistry.resolve("https://x/nope.bar")).toThrow(UnknownFormatError);
  });

  test("returns first registration when several would match", () => {
    // Same-plugin re-registration short-circuits to no-op; cross-plugin
    // collision throws. The only way two registrations both match a URL
    // is via different key shapes (e.g. one regex, one string) — and
    // insertion order resolves deterministically.
    const first = stubHandler();
    const second = stubHandler();
    formatRegistry.add("p1", "foo", first);
    formatRegistry.add("p2", /\.foo$/, second);
    expect(formatRegistry.resolve("https://x/a.foo").handler).toBe(first);
  });
});

describe("FormatRegistry.scopedFor", () => {
  test("scoped adapter routes to the host-internal add()", () => {
    const adapter = formatRegistry.scopedFor("p1");
    adapter.register("foo", stubHandler());
    expect(formatRegistry.list()[0]).toMatchObject({
      keys: ["foo"],
      pluginName: "p1",
    });
  });

  test("scoped adapter forwards array aliases", () => {
    const adapter = formatRegistry.scopedFor("p1");
    adapter.register(["a", "b"], stubHandler());
    expect(formatRegistry.list()[0].keys).toEqual(["a", "b"]);
  });

  test("scoped adapter forwards regex extensions", () => {
    const adapter = formatRegistry.scopedFor("p1");
    const re = /^dicom:/;
    adapter.register(re, stubHandler());
    expect(formatRegistry.list()[0].keys).toEqual([re]);
  });
});
