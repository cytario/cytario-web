import { getOffsetKeyForOmeTiff, isOmeTiff } from "~/utils/omeTiffOffsets";

describe("omeTiffOffsets", () => {
  describe("getOffsetKeyForOmeTiff", () => {
    test("derives offsets key from .ome.tif", () => {
      expect(getOffsetKeyForOmeTiff("image.ome.tif")).toBe(
        "image.offsets.json",
      );
    });

    test("derives offsets key from .ome.tiff", () => {
      expect(getOffsetKeyForOmeTiff("image.ome.tiff")).toBe(
        "image.offsets.json",
      );
    });

    test("handles case insensitivity", () => {
      expect(getOffsetKeyForOmeTiff("image.OME.TIF")).toBe(
        "image.offsets.json",
      );
      expect(getOffsetKeyForOmeTiff("image.Ome.Tiff")).toBe(
        "image.offsets.json",
      );
    });

    test("preserves directory paths", () => {
      expect(getOffsetKeyForOmeTiff("data/subdir/image.ome.tif")).toBe(
        "data/subdir/image.offsets.json",
      );
    });

    test("returns null for non-OME-TIFF files", () => {
      expect(getOffsetKeyForOmeTiff("image.tif")).toBeNull();
      expect(getOffsetKeyForOmeTiff("image.tiff")).toBeNull();
      expect(getOffsetKeyForOmeTiff("image.png")).toBeNull();
      expect(getOffsetKeyForOmeTiff("image.csv")).toBeNull();
      expect(getOffsetKeyForOmeTiff("image.ome.zarr")).toBeNull();
    });
  });

  describe("isOmeTiff", () => {
    test("returns true for .ome.tif", () => {
      expect(isOmeTiff("image.ome.tif")).toBe(true);
    });

    test("returns true for .ome.tiff", () => {
      expect(isOmeTiff("image.ome.tiff")).toBe(true);
    });

    test("is case insensitive", () => {
      expect(isOmeTiff("image.OME.TIFF")).toBe(true);
    });

    test("returns false for non-OME-TIFF files", () => {
      expect(isOmeTiff("image.tif")).toBe(false);
      expect(isOmeTiff("image.png")).toBe(false);
    });
  });
});
