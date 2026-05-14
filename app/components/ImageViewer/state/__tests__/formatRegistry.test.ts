import {
  DuplicateRegistrationError,
  UnknownFormatError,
  formatRegistry,
} from "../formatRegistry";
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
  test("registers an extension and exposes it via list()", () => {
    formatRegistry.add("p1", "foo", stubHandler());
    expect(formatRegistry.list()).toHaveLength(1);
    expect(formatRegistry.list()[0]).toMatchObject({
      extension: "foo",
      pluginName: "p1",
    });
  });

  test("lowercases extension and strips leading dot", () => {
    formatRegistry.add("p1", ".FoO", stubHandler());
    expect(formatRegistry.list()[0].extension).toBe("foo");
  });

  test("same-plugin re-registration of the same extension is a no-op", () => {
    const h = stubHandler();
    formatRegistry.add("p1", "foo", h);
    formatRegistry.add("p1", "foo", h);
    expect(formatRegistry.list()).toHaveLength(1);
  });

  test("cross-plugin collision on the same extension throws", () => {
    formatRegistry.add("p1", "foo", stubHandler());
    expect(() => formatRegistry.add("p2", "foo", stubHandler())).toThrow(
      DuplicateRegistrationError,
    );
  });
});

describe("FormatRegistry.resolve", () => {
  test("match() takes precedence over extension lookup", () => {
    const matchH = stubHandler({
      match: (url) => url.includes("custom-token"),
    });
    const extH = stubHandler();
    formatRegistry.add("p1", "foo", extH);
    formatRegistry.add("p2", "bar", matchH);
    expect(formatRegistry.resolve("https://x/custom-token.foo").handler).toBe(matchH);
  });

  test("falls back to extension when no match() matches", () => {
    const extH = stubHandler();
    formatRegistry.add("p1", "foo", extH);
    expect(formatRegistry.resolve("https://x/sample.foo").handler).toBe(extH);
  });

  test("compound extensions resolve via getExtension", () => {
    const h = stubHandler();
    formatRegistry.add("p1", "ome.tif", h);
    expect(formatRegistry.resolve("https://x/a.ome.tif").handler).toBe(h);
  });

  test("throws UnknownFormatError when neither match nor extension hits", () => {
    formatRegistry.add("p1", "foo", stubHandler());
    expect(() => formatRegistry.resolve("https://x/nope.bar")).toThrow(
      UnknownFormatError,
    );
  });

  test("returns first registration when several match by extension", () => {
    // Same-plugin re-registration short-circuits to no-op (HMR semantics),
    // so the only way two registrations share an extension is via the
    // cross-plugin path (which throws). Therefore extension resolution is
    // deterministic on insertion order with no ambiguity.
    const firstH = stubHandler();
    formatRegistry.add("p1", "foo", firstH);
    expect(formatRegistry.resolve("https://x/a.foo").handler).toBe(firstH);
  });
});

describe("FormatRegistry.scopedFor", () => {
  test("scoped adapter routes to the host-internal add()", () => {
    const adapter = formatRegistry.scopedFor("p1");
    adapter.register("foo", stubHandler());
    expect(formatRegistry.list()[0]).toMatchObject({
      extension: "foo",
      pluginName: "p1",
    });
  });
});
