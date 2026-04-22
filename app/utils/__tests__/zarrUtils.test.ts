import { isZarrPath } from "../zarrUtils";

describe("isZarrPath", () => {
  describe("detection with .zarr extension", () => {
    test("detects URL ending with .zarr", () => {
      expect(
        isZarrPath("https://bucket.s3.amazonaws.com/data.zarr"),
      ).toBe(true);
    });

    test("detects URL ending with .zarr/", () => {
      expect(
        isZarrPath("https://bucket.s3.amazonaws.com/image.zarr/"),
      ).toBe(true);
    });

    test("detects URL with .zarr in path", () => {
      expect(
        isZarrPath(
          "https://bucket.s3.amazonaws.com/images/sample.zarr/0/0/0",
        ),
      ).toBe(true);
    });

    test("detects MinIO URL with .zarr", () => {
      expect(
        isZarrPath("http://localhost:9000/bucket/USL-2023-52461-2.zarr"),
      ).toBe(true);
    });

    test("detects AWS S3 virtual-hosted URL with .zarr", () => {
      expect(
        isZarrPath(
          "https://my-bucket.s3.us-west-2.amazonaws.com/data.zarr",
        ),
      ).toBe(true);
    });

    test("detects path ending with .zarr", () => {
      expect(isZarrPath("images/sample.zarr")).toBe(true);
    });

    test("detects path ending with .zarr/", () => {
      expect(isZarrPath("images/sample.zarr/")).toBe(true);
    });

    test("detects nested zarr path", () => {
      expect(isZarrPath("experiments/2024/USL-2023-52461-2.zarr/0/0")).toBe(
        true,
      );
    });

    test("detects zarr at root level", () => {
      expect(isZarrPath("data.zarr")).toBe(true);
    });
  });

  describe("non-zarr URLs and paths", () => {
    test("returns false for OME-TIFF files", () => {
      expect(
        isZarrPath("https://bucket.s3.amazonaws.com/image.ome.tif"),
      ).toBe(false);
    });

    test("returns false for regular TIFF files", () => {
      expect(
        isZarrPath("https://bucket.s3.amazonaws.com/image.tiff"),
      ).toBe(false);
    });

    test("returns false for parquet files", () => {
      expect(
        isZarrPath("https://bucket.s3.amazonaws.com/data.parquet"),
      ).toBe(false);
    });

    test("returns false for directory without .zarr extension", () => {
      expect(
        isZarrPath(
          "https://bucket.s3.amazonaws.com/images/USL-2023-52461-2/",
        ),
      ).toBe(false);
    });

    test("returns false for paths with 'zarr' as substring (no dot)", () => {
      expect(
        isZarrPath("https://bucket.s3.amazonaws.com/zarring/data"),
      ).toBe(false);
    });

    test("returns false for regular directory path", () => {
      expect(isZarrPath("images/USL-2023-52461-2/")).toBe(false);
    });

    test("returns false for TIFF path", () => {
      expect(isZarrPath("images/sample.ome.tif")).toBe(false);
    });

    test("does not match .zarr as part of a longer extension", () => {
      expect(
        isZarrPath("https://example.com/.zarr-config/settings"),
      ).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("handles empty string", () => {
      expect(isZarrPath("")).toBe(false);
    });

    test("handles URLs with query parameters", () => {
      expect(
        isZarrPath("https://bucket.s3.amazonaws.com/data.zarr?version=1"),
      ).toBe(true);
    });

    test("handles empty path", () => {
      expect(isZarrPath("")).toBe(false);
    });
  });
});

