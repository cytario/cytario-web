import { formatRegistry } from "../formatRegistry";
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

describe("FormatRegistry.resolveLocalSource", () => {
  test("claims a bare file name for a handler that supports local sources", () => {
    formatRegistry.add("p1", "czi", stubHandler({ supportsLocalSource: true }));

    const registration = formatRegistry.resolveLocalSource("slide.czi");
    expect(registration?.pluginName).toBe("p1");
  });

  test("does not claim a name whose handler is URL-only", () => {
    formatRegistry.add("p1", "czi", stubHandler());

    expect(formatRegistry.resolveLocalSource("slide.czi")).toBeUndefined();
  });

  test("does not claim an unregistered name", () => {
    formatRegistry.add("p1", "czi", stubHandler({ supportsLocalSource: true }));

    expect(formatRegistry.resolveLocalSource("slide.unknown")).toBeUndefined();
  });

  test("compound extensions resolve via getExtension on the bare name", () => {
    formatRegistry.add("p1", "ome.tif", stubHandler({ supportsLocalSource: true }));

    expect(formatRegistry.resolveLocalSource("USL-1.ome.tif")?.pluginName).toBe("p1");
  });

  test("regex keys are tested against the bare file name", () => {
    formatRegistry.add("p1", /\.czi$/i, stubHandler({ supportsLocalSource: true }));

    expect(formatRegistry.resolveLocalSource("slide.CZI")?.pluginName).toBe("p1");
  });
});
