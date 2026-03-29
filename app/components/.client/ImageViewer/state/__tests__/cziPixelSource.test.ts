import type {
  Image as CziImage,
  Loader as CziLoader,
} from "@slash-m/czi-loader";
import { describe, expect, test, vi } from "vitest";

import { adaptCziToViv } from "../cziPixelSource";

function createMockCziResult(): { data: CziLoader; metadata: CziImage } {
  const mockLevel = {
    getTile: vi.fn().mockResolvedValue({
      data: new Uint16Array(512 * 512),
      width: 512,
      height: 512,
    }),
    getRaster: vi.fn().mockResolvedValue({
      data: new Uint16Array(1024 * 1024),
      width: 1024,
      height: 1024,
    }),
  };

  return {
    data: [mockLevel, mockLevel] as unknown as CziLoader,
    metadata: {
      Pixels: {
        Type: "Uint16",
        SizeX: 2048,
        SizeY: 1024,
        SizeZ: 5,
        SizeC: 3,
        SizeT: 1,
        Channels: [
          { ID: "Channel:0", Name: "DAPI", Color: [0, 0, 255, 255] as [number, number, number, number] },
          { ID: "Channel:1", Name: "GFP", Color: [0, 255, 0, 255] as [number, number, number, number] },
          { ID: "Channel:2", Name: "RFP", Color: [255, 0, 0, 255] as [number, number, number, number] },
        ],
      },
    },
  };
}

describe("adaptCziToViv", () => {
  test("returns the correct number of loader levels", () => {
    const cziResult = createMockCziResult();
    const { data } = adaptCziToViv(cziResult);
    expect(data).toHaveLength(2);
  });

  test("adapted levels have viv PixelSource properties", () => {
    const cziResult = createMockCziResult();
    const { data } = adaptCziToViv(cziResult);
    const level = data[0] as unknown as Record<string, unknown>;

    expect(level.dtype).toBe("Uint16");
    expect(level.tileSize).toBe(512);
    expect(level.labels).toEqual(["t", "c", "z", "y", "x"]);
    expect(level.shape).toEqual([1, 3, 5, 1024, 2048]);
    expect(typeof level.getTile).toBe("function");
    expect(typeof level.getRaster).toBe("function");
    expect(typeof level.onTileError).toBe("function");
  });

  test("second level has downscaled shape", () => {
    const cziResult = createMockCziResult();
    const { data } = adaptCziToViv(cziResult);
    const level1 = data[1] as unknown as Record<string, unknown>;

    expect(level1.shape).toEqual([1, 3, 5, 512, 1024]);
  });

  test("metadata is adapted to OME-TIFF shape", () => {
    const cziResult = createMockCziResult();
    const { metadata } = adaptCziToViv(cziResult);

    expect(metadata.Pixels.SizeX).toBe(2048);
    expect(metadata.Pixels.SizeY).toBe(1024);
    expect(metadata.Pixels.SizeZ).toBe(5);
    expect(metadata.Pixels.SizeC).toBe(3);
    expect(metadata.Pixels.SizeT).toBe(1);
    expect(metadata.Pixels.Channels).toHaveLength(3);
    expect(metadata.Pixels.Channels[0].Name).toBe("DAPI");
  });

  test("getTile delegates to CZI loader level with mapped selection", async () => {
    const cziResult = createMockCziResult();
    const { data } = adaptCziToViv(cziResult);
    const level = data[0] as unknown as { getTile: (sel: unknown) => Promise<unknown> };

    await level.getTile({
      x: 2,
      y: 3,
      selection: { t: 0, c: 1, z: 2 },
    });

    const mockLevel = cziResult.data[0];
    expect(mockLevel.getTile).toHaveBeenCalledWith({
      x: 2,
      y: 3,
      selection: { c: 1, z: 2, t: 0, x: 2, y: 3 },
    });
  });

  test("getRaster delegates to CZI loader level", async () => {
    const cziResult = createMockCziResult();
    const { data } = adaptCziToViv(cziResult);
    const level = data[0] as unknown as { getRaster: (sel: unknown) => Promise<unknown> };

    await level.getRaster({
      selection: { t: 0, c: 1, z: 2 },
    });

    const mockLevel = cziResult.data[0];
    expect(mockLevel.getRaster).toHaveBeenCalledWith({
      selection: { c: 1, z: 2, t: 0, x: 0, y: 0 },
    });
  });
});
