import type { RootAttrs } from "@hms-dbmi/viv";

import {
  parseOmeroColor,
  extractPhysicalSizes,
  rootAttrsToImage,
} from "../loadBioformatsZarrWithCredentials";
import type { Loader } from "../ome.tif.types";

// Helper to create a mock loader with shape and labels
function createMockLoader(
  shape: number[],
  labels: string[],
): Loader {
  return [{ shape, labels }] as unknown as Loader;
}

// Helper to create minimal RootAttrs
function createRootAttrs(
  overrides: {
    channels?: Array<{ label: string; color: string; channelsVisible?: boolean; window?: { start: number; end: number } }>;
    name?: string;
    axes?: string[] | Array<{ name: string; type?: string; unit?: string }>;
    datasets?: Array<{ path: string; coordinateTransformations?: Array<{ type: string; scale?: number[] }> }>;
  } = {},
): RootAttrs {
  return {
    omero: {
      channels: overrides.channels?.map((ch) => ({
        channelsVisible: ch.channelsVisible ?? true,
        color: ch.color,
        label: ch.label,
        window: ch.window ?? { start: 0, end: 255 },
      })) ?? [],
      rdefs: { model: "color" },
      name: overrides.name,
    },
    multiscales: [
      {
        datasets: overrides.datasets ?? [{ path: "0" }],
        axes: overrides.axes ?? [
          { name: "t", type: "time" },
          { name: "c", type: "channel" },
          { name: "z", type: "space", unit: "µm" },
          { name: "y", type: "space", unit: "µm" },
          { name: "x", type: "space", unit: "µm" },
        ],
      },
    ],
  };
}

describe("parseOmeroColor", () => {
  test("returns undefined for empty string", () => {
    expect(parseOmeroColor("")).toBeUndefined();
  });

  test("parses 6-char hex RGB with default alpha 255", () => {
    expect(parseOmeroColor("FF0000")).toEqual([255, 0, 0, 255]);
  });

  test("parses green hex color", () => {
    expect(parseOmeroColor("00FF00")).toEqual([0, 255, 0, 255]);
  });

  test("parses blue hex color", () => {
    expect(parseOmeroColor("0000FF")).toEqual([0, 0, 255, 255]);
  });

  test("parses 8-char hex RGBA", () => {
    expect(parseOmeroColor("FF000080")).toEqual([255, 0, 0, 128]);
  });

  test("parses white color", () => {
    expect(parseOmeroColor("FFFFFF")).toEqual([255, 255, 255, 255]);
  });

  test("strips leading # prefix", () => {
    expect(parseOmeroColor("#FF0000")).toEqual([255, 0, 0, 255]);
  });

  test("returns undefined for invalid hex", () => {
    expect(parseOmeroColor("not-hex")).toBeUndefined();
  });
});

describe("extractPhysicalSizes", () => {
  test("returns empty object when multiscale is undefined", () => {
    expect(extractPhysicalSizes(undefined, [])).toEqual({});
  });

  test("returns empty object when no datasets", () => {
    const multiscale = { datasets: [], axes: [] };
    expect(extractPhysicalSizes(multiscale, [])).toEqual({});
  });

  test("returns empty object when no scale transform", () => {
    const multiscale = {
      datasets: [{ path: "0" }],
      axes: [{ name: "y" }, { name: "x" }],
    };
    expect(extractPhysicalSizes(multiscale, multiscale.axes)).toEqual({});
  });

  test("extracts physical sizes from scale transform", () => {
    const axes = [
      { name: "t", type: "time" },
      { name: "c", type: "channel" },
      { name: "z", type: "space" },
      { name: "y", type: "space" },
      { name: "x", type: "space" },
    ];
    const multiscale = {
      datasets: [
        {
          path: "0",
          coordinateTransformations: [
            { type: "scale" as const, scale: [1.0, 1.0, 2.0, 0.65, 0.65] },
          ],
        },
      ],
      axes,
    };

    const result = extractPhysicalSizes(multiscale, axes);

    expect(result.PhysicalSizeX).toBe(0.65);
    expect(result.PhysicalSizeY).toBe(0.65);
    expect(result.PhysicalSizeZ).toBe(2.0);
  });

  test("handles string axes format", () => {
    const axes = ["t", "c", "z", "y", "x"];
    const multiscale = {
      datasets: [
        {
          path: "0",
          coordinateTransformations: [
            { type: "scale" as const, scale: [1.0, 1.0, 1.0, 0.5, 0.5] },
          ],
        },
      ],
      axes,
    };

    const result = extractPhysicalSizes(multiscale, axes);

    expect(result.PhysicalSizeX).toBe(0.5);
    expect(result.PhysicalSizeY).toBe(0.5);
    expect(result.PhysicalSizeZ).toBe(1.0);
  });
});

describe("rootAttrsToImage", () => {
  test("maps basic RootAttrs to Image with correct dimensions", () => {
    const rootAttrs = createRootAttrs({ name: "Test Image" });
    const loader = createMockLoader(
      [1, 3, 1, 1024, 1024],
      ["t", "c", "z", "y", "x"],
    );

    const result = rootAttrsToImage(rootAttrs, loader);

    expect(result.ID).toBe("Image:0");
    expect(result.Name).toBe("Test Image");
    expect(result.Pixels.SizeX).toBe(1024);
    expect(result.Pixels.SizeY).toBe(1024);
    expect(result.Pixels.SizeZ).toBe(1);
    expect(result.Pixels.SizeC).toBe(3);
    expect(result.Pixels.SizeT).toBe(1);
    expect(result.Pixels.DimensionOrder).toBe("XYZCT");
    expect(result.Pixels.Type).toBe("uint16");
  });

  test("maps channels with names and colors", () => {
    const rootAttrs = createRootAttrs({
      channels: [
        { label: "DAPI", color: "FF0000" },
        { label: "GFP", color: "00FF00" },
      ],
    });
    const loader = createMockLoader(
      [1, 2, 1, 512, 512],
      ["t", "c", "z", "y", "x"],
    );

    const result = rootAttrsToImage(rootAttrs, loader);

    expect(result.Pixels.Channels).toHaveLength(2);
    expect(result.Pixels.Channels[0]).toEqual({
      ID: "Channel:0:0",
      Name: "DAPI",
      Color: [255, 0, 0, 255],
    });
    expect(result.Pixels.Channels[1]).toEqual({
      ID: "Channel:0:1",
      Name: "GFP",
      Color: [0, 255, 0, 255],
    });
  });

  test("extracts physical sizes from coordinate transformations", () => {
    const rootAttrs = createRootAttrs({
      axes: [
        { name: "t", type: "time" },
        { name: "c", type: "channel" },
        { name: "z", type: "space", unit: "µm" },
        { name: "y", type: "space", unit: "µm" },
        { name: "x", type: "space", unit: "µm" },
      ],
      datasets: [
        {
          path: "0",
          coordinateTransformations: [
            { type: "scale", scale: [1.0, 1.0, 1.0, 0.65, 0.65] },
          ],
        },
      ],
    });
    const loader = createMockLoader(
      [1, 1, 1, 1024, 1024],
      ["t", "c", "z", "y", "x"],
    );

    const result = rootAttrsToImage(rootAttrs, loader);

    expect(result.Pixels.PhysicalSizeX).toBe(0.65);
    expect(result.Pixels.PhysicalSizeY).toBe(0.65);
    expect(result.Pixels.PhysicalSizeZ).toBe(1.0);
    expect(result.Pixels.PhysicalSizeXUnit).toBe("µm");
  });

  test("uses default unit when axis has no unit", () => {
    const rootAttrs = createRootAttrs({
      axes: [
        { name: "y", type: "space" },
        { name: "x", type: "space" },
      ],
    });
    const loader = createMockLoader([512, 512], ["y", "x"]);

    const result = rootAttrsToImage(rootAttrs, loader);

    expect(result.Pixels.PhysicalSizeXUnit).toBe("µm");
    expect(result.Pixels.PhysicalSizeYUnit).toBe("µm");
  });

  test("defaults missing dimensions to 1", () => {
    const rootAttrs = createRootAttrs({
      axes: [
        { name: "y", type: "space" },
        { name: "x", type: "space" },
      ],
    });
    const loader = createMockLoader([512, 512], ["y", "x"]);

    const result = rootAttrsToImage(rootAttrs, loader);

    expect(result.Pixels.SizeX).toBe(512);
    expect(result.Pixels.SizeY).toBe(512);
    expect(result.Pixels.SizeZ).toBe(1);
    expect(result.Pixels.SizeT).toBe(1);
    expect(result.Pixels.SizeC).toBe(1);
  });

  test("format() returns formatted metadata object", () => {
    const rootAttrs = createRootAttrs({
      channels: [
        { label: "Ch1", color: "FF0000" },
        { label: "Ch2", color: "00FF00" },
        { label: "Ch3", color: "0000FF" },
        { label: "Ch4", color: "FFFFFF" },
      ],
    });
    const loader = createMockLoader(
      [5, 4, 10, 1080, 1920],
      ["t", "c", "z", "y", "x"],
    );

    const result = rootAttrsToImage(rootAttrs, loader);
    const formatted = result.format();

    expect(formatted["Dimensions (XY)"]).toBe("1920 x 1080");
    expect(formatted["Pixels Type"]).toBe("uint16");
    expect(formatted["Z-sections/Timepoints"]).toBe("10 x 5");
    expect(formatted.Channels).toBe(4);
  });
});
