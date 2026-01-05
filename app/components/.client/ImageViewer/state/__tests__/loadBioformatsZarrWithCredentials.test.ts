// @ts-expect-error - zarr package has type resolution issues with package.json exports
import type { ZarrArray } from "zarr";

import {
  guessTileSize,
  guessBioformatsLabels,
  parseOmeXml,
  parseColor,
} from "../loadBioformatsZarrWithCredentials";
import type { Image } from "../ome.tif.types";

describe("parseColor", () => {
  test("returns undefined for null input", () => {
    expect(parseColor(null)).toBeUndefined();
  });

  test("returns undefined for empty string", () => {
    expect(parseColor("")).toBeUndefined();
  });

  test("returns undefined for non-numeric string", () => {
    expect(parseColor("not-a-number")).toBeUndefined();
  });

  test("parses positive color integer to RGBA", () => {
    // Red (255, 0, 0, 255) as signed 32-bit int
    // -16776961 in signed = 0xFF0000FF
    const result = parseColor("-16776961");
    expect(result).toEqual([255, 0, 0, 255]);
  });

  test("parses green color", () => {
    // Green (0, 255, 0, 255) = 0x00FF00FF = 16711935
    const result = parseColor("16711935");
    expect(result).toEqual([0, 255, 0, 255]);
  });

  test("parses blue color", () => {
    // Blue (0, 0, 255, 255) = 0x0000FFFF = 65535
    const result = parseColor("65535");
    expect(result).toEqual([0, 0, 255, 255]);
  });

  test("parses white color", () => {
    // White (255, 255, 255, 255) = 0xFFFFFFFF = -1 as signed int
    const result = parseColor("-1");
    expect(result).toEqual([255, 255, 255, 255]);
  });

  test("parses color with alpha channel", () => {
    // Semi-transparent red (255, 0, 0, 128) = 0xFF000080
    const result = parseColor("-16777088");
    expect(result).toEqual([255, 0, 0, 128]);
  });
});

describe("guessTileSize", () => {
  const createMockZarrArray = (shape: number[], chunks: number[]): ZarrArray =>
    ({
      shape,
      chunks,
    }) as unknown as ZarrArray;

  test("returns power of 2 tile size from chunk dimensions", () => {
    const arr = createMockZarrArray(
      [1, 3, 1, 1024, 1024], // t, c, z, y, x
      [1, 1, 1, 512, 512] // chunks
    );

    expect(guessTileSize(arr)).toBe(512);
  });

  test("returns previous power of 2 for non-power-of-2 chunks", () => {
    const arr = createMockZarrArray([1, 3, 1, 1000, 1000], [1, 1, 1, 300, 300]);

    // 300 -> floor(log2(300)) = 8 -> 2^8 = 256
    expect(guessTileSize(arr)).toBe(256);
  });

  test("uses minimum of y and x chunk sizes", () => {
    const arr = createMockZarrArray(
      [1, 1, 1, 2048, 1024],
      [1, 1, 1, 512, 256] // y chunk = 512, x chunk = 256
    );

    expect(guessTileSize(arr)).toBe(256);
  });

  test("handles interleaved RGB data (last dim = 3)", () => {
    const arr = createMockZarrArray(
      [1, 1, 1024, 1024, 3], // y, x, rgb
      [1, 1, 256, 256, 3]
    );

    expect(guessTileSize(arr)).toBe(256);
  });

  test("handles interleaved RGBA data (last dim = 4)", () => {
    const arr = createMockZarrArray(
      [1, 1, 512, 512, 4], // y, x, rgba
      [1, 1, 128, 128, 4]
    );

    expect(guessTileSize(arr)).toBe(128);
  });

  test("handles small chunk sizes", () => {
    const arr = createMockZarrArray([1, 1, 1, 64, 64], [1, 1, 1, 32, 32]);

    expect(guessTileSize(arr)).toBe(32);
  });
});

describe("guessBioformatsLabels", () => {
  const createMockZarrArray = (shape: number[]): ZarrArray =>
    ({
      shape,
    }) as unknown as ZarrArray;

  const createMockMetadata = (
    sizeT: number,
    sizeC: number,
    sizeZ: number,
    sizeY: number,
    sizeX: number,
    dimensionOrder = "XYZCT"
  ): Image =>
    ({
      Pixels: {
        SizeT: sizeT,
        SizeC: sizeC,
        SizeZ: sizeZ,
        SizeY: sizeY,
        SizeX: sizeX,
        DimensionOrder: dimensionOrder,
      },
    }) as unknown as Image;

  test("returns tczyx labels when shape matches OME-Zarr layout", () => {
    const arr = createMockZarrArray([1, 3, 1, 1024, 1024]);
    const metadata = createMockMetadata(1, 3, 1, 1024, 1024);

    expect(guessBioformatsLabels(arr, metadata)).toEqual([
      "t",
      "c",
      "z",
      "y",
      "x",
    ]);
  });

  test("falls back to reversed dimension order when shape doesn't match", () => {
    const arr = createMockZarrArray([1024, 1024, 1, 3, 1]); // Different order
    const metadata = createMockMetadata(1, 3, 1, 1024, 1024, "XYZCT");

    // XYZCT reversed = TCZYX -> ['t', 'c', 'z', 'y', 'x']
    expect(guessBioformatsLabels(arr, metadata)).toEqual([
      "t",
      "c",
      "z",
      "y",
      "x",
    ]);
  });

  test("handles XYZTC dimension order", () => {
    const arr = createMockZarrArray([100, 100, 1, 1, 1]); // Doesn't match
    const metadata = createMockMetadata(1, 1, 1, 100, 100, "XYZTC");

    // XYZTC reversed = CTZYX -> ['c', 't', 'z', 'y', 'x']
    expect(guessBioformatsLabels(arr, metadata)).toEqual([
      "c",
      "t",
      "z",
      "y",
      "x",
    ]);
  });
});

describe("parseOmeXml", () => {
  test("parses basic OME-XML with image dimensions", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <OME xmlns="http://www.openmicroscopy.org/Schemas/OME/2016-06">
        <Image ID="Image:0" Name="Test Image">
          <Pixels ID="Pixels:0"
                  DimensionOrder="XYZCT"
                  Type="uint16"
                  SizeX="1024"
                  SizeY="1024"
                  SizeZ="1"
                  SizeC="3"
                  SizeT="1">
          </Pixels>
        </Image>
      </OME>`;

    const result = parseOmeXml(xml);

    expect(result.ID).toBe("Image:0");
    expect(result.Name).toBe("Test Image");
    expect(result.Pixels.SizeX).toBe(1024);
    expect(result.Pixels.SizeY).toBe(1024);
    expect(result.Pixels.SizeZ).toBe(1);
    expect(result.Pixels.SizeC).toBe(3);
    expect(result.Pixels.SizeT).toBe(1);
    expect(result.Pixels.Type).toBe("uint16");
    expect(result.Pixels.DimensionOrder).toBe("XYZCT");
  });

  test("parses channels with names and colors", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <OME xmlns="http://www.openmicroscopy.org/Schemas/OME/2016-06">
        <Image ID="Image:0">
          <Pixels ID="Pixels:0" SizeX="512" SizeY="512" SizeC="2">
            <Channel ID="Channel:0:0" Name="DAPI" Color="-16776961" SamplesPerPixel="1"/>
            <Channel ID="Channel:0:1" Name="GFP" Color="16711935"/>
          </Pixels>
        </Image>
      </OME>`;

    const result = parseOmeXml(xml);

    expect(result.Pixels.Channels).toHaveLength(2);
    expect(result.Pixels.Channels[0]).toEqual({
      ID: "Channel:0:0",
      Name: "DAPI",
      Color: [255, 0, 0, 255], // Red
      SamplesPerPixel: 1,
    });
    expect(result.Pixels.Channels[1]).toEqual({
      ID: "Channel:0:1",
      Name: "GFP",
      Color: [0, 255, 0, 255], // Green
      SamplesPerPixel: undefined,
    });
  });

  test("parses physical size attributes", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <OME xmlns="http://www.openmicroscopy.org/Schemas/OME/2016-06">
        <Image ID="Image:0">
          <Pixels ID="Pixels:0"
                  SizeX="1024"
                  SizeY="1024"
                  PhysicalSizeX="0.65"
                  PhysicalSizeY="0.65"
                  PhysicalSizeZ="1.0"
                  PhysicalSizeXUnit="µm"
                  PhysicalSizeYUnit="µm"
                  PhysicalSizeZUnit="µm">
          </Pixels>
        </Image>
      </OME>`;

    const result = parseOmeXml(xml);

    expect(result.Pixels.PhysicalSizeX).toBe(0.65);
    expect(result.Pixels.PhysicalSizeY).toBe(0.65);
    expect(result.Pixels.PhysicalSizeZ).toBe(1.0);
    expect(result.Pixels.PhysicalSizeXUnit).toBe("µm");
  });

  test("uses default values for missing attributes", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <OME xmlns="http://www.openmicroscopy.org/Schemas/OME/2016-06">
        <Image>
          <Pixels SizeX="100" SizeY="100">
          </Pixels>
        </Image>
      </OME>`;

    const result = parseOmeXml(xml);

    expect(result.ID).toBe("Image:0");
    expect(result.Pixels.ID).toBe("Pixels:0");
    expect(result.Pixels.DimensionOrder).toBe("XYZCT");
    expect(result.Pixels.Type).toBe("uint16");
    expect(result.Pixels.SizeT).toBe(1);
    expect(result.Pixels.SizeC).toBe(1);
    expect(result.Pixels.SizeZ).toBe(1);
    expect(result.Pixels.PhysicalSizeXUnit).toBe("µm");
  });

  test("throws error when Pixels element is missing", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <OME xmlns="http://www.openmicroscopy.org/Schemas/OME/2016-06">
        <Image ID="Image:0">
        </Image>
      </OME>`;

    expect(() => parseOmeXml(xml)).toThrow(
      "Invalid OME-XML: missing Pixels element"
    );
  });

  test("strips null character from end of XML string", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <OME xmlns="http://www.openmicroscopy.org/Schemas/OME/2016-06">
        <Image ID="Image:0">
          <Pixels ID="Pixels:0" SizeX="100" SizeY="100"/>
        </Image>
      </OME>\0`;

    // Should not throw
    const result = parseOmeXml(xml);
    expect(result.ID).toBe("Image:0");
  });

  test("generates fallback channel IDs when not provided", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <OME xmlns="http://www.openmicroscopy.org/Schemas/OME/2016-06">
        <Image ID="Image:0">
          <Pixels ID="Pixels:0" SizeX="100" SizeY="100">
            <Channel Name="DAPI"/>
            <Channel Name="GFP"/>
          </Pixels>
        </Image>
      </OME>`;

    const result = parseOmeXml(xml);

    expect(result.Pixels.Channels[0].ID).toBe("Channel:0:0");
    expect(result.Pixels.Channels[1].ID).toBe("Channel:0:1");
  });

  test("format() returns formatted metadata object", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <OME xmlns="http://www.openmicroscopy.org/Schemas/OME/2016-06">
        <Image ID="Image:0">
          <Pixels ID="Pixels:0"
                  Type="uint8"
                  SizeX="1920"
                  SizeY="1080"
                  SizeZ="10"
                  SizeC="4"
                  SizeT="5">
            <Channel Name="Ch1"/>
            <Channel Name="Ch2"/>
            <Channel Name="Ch3"/>
            <Channel Name="Ch4"/>
          </Pixels>
        </Image>
      </OME>`;

    const result = parseOmeXml(xml);
    const formatted = result.format();

    expect(formatted["Dimensions (XY)"]).toBe("1920 x 1080");
    expect(formatted["Pixels Type"]).toBe("uint8");
    expect(formatted["Z-sections/Timepoints"]).toBe("10 x 5");
    expect(formatted.Channels).toBe(4);
  });
});
