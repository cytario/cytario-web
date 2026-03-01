import { constructS3Url, isZarrPath } from "../zarrUtils";

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

describe("constructS3Url", () => {
  describe("AWS S3 URLs", () => {
    test("constructs virtual-hosted style URL with region", () => {
      const config = {
        name: "my-bucket",
        region: "us-west-2",
        endpoint: "",
      };

      const result = constructS3Url(config, "images/sample.zarr");

      expect(result).toBe(
        "https://my-bucket.s3.us-west-2.amazonaws.com/images/sample.zarr",
      );
    });

    test("uses us-east-1 as default region", () => {
      const config = {
        name: "my-bucket",
        region: null,
        endpoint: "",
      };

      const result = constructS3Url(config, "data.zarr");

      expect(result).toBe(
        "https://my-bucket.s3.us-east-1.amazonaws.com/data.zarr",
      );
    });

    test("handles path with trailing slash", () => {
      const config = {
        name: "bucket",
        region: "eu-west-1",
        endpoint: "",
      };

      const result = constructS3Url(config, "images/sample.zarr/");

      expect(result).toBe(
        "https://bucket.s3.eu-west-1.amazonaws.com/images/sample.zarr/",
      );
    });
  });

  describe("Custom endpoint URLs (MinIO, R2)", () => {
    test("constructs URL with custom endpoint", () => {
      const config = {
        name: "my-bucket",
        endpoint: "http://localhost:9000",
        region: null,
      };

      const result = constructS3Url(config, "data.zarr");

      expect(result).toBe("http://localhost:9000/my-bucket/data.zarr");
    });

    test("strips trailing slash from endpoint", () => {
      const config = {
        name: "bucket",
        endpoint: "http://localhost:9000/",
        region: null,
      };

      const result = constructS3Url(config, "images/sample.zarr");

      expect(result).toBe("http://localhost:9000/bucket/images/sample.zarr");
    });

    test("handles HTTPS custom endpoint", () => {
      const config = {
        name: "bucket",
        endpoint: "https://minio.example.com",
        region: null,
      };

      const result = constructS3Url(config, "data.zarr");

      expect(result).toBe("https://minio.example.com/bucket/data.zarr");
    });

    test("handles R2 endpoint", () => {
      const config = {
        name: "my-r2-bucket",
        endpoint: "https://account-id.r2.cloudflarestorage.com",
        region: null,
      };

      const result = constructS3Url(config, "images/test.zarr");

      expect(result).toBe(
        "https://account-id.r2.cloudflarestorage.com/my-r2-bucket/images/test.zarr",
      );
    });

    test("ignores region when endpoint is provided", () => {
      const config = {
        name: "bucket",
        region: "us-west-2",
        endpoint: "http://localhost:9000",
      };

      const result = constructS3Url(config, "data.zarr");

      expect(result).toBe("http://localhost:9000/bucket/data.zarr");
      expect(result).not.toContain("s3.us-west-2");
    });
  });

  describe("edge cases", () => {
    test("handles empty path", () => {
      const config = {
        name: "bucket",
        region: "us-east-1",
        endpoint: "",
      };

      const result = constructS3Url(config, "");

      expect(result).toBe("https://bucket.s3.us-east-1.amazonaws.com/");
    });

    test("handles deeply nested path", () => {
      const config = {
        name: "bucket",
        endpoint: "http://localhost:9000",
        region: null,
      };

      const result = constructS3Url(config, "a/b/c/d/e/f/data.zarr");

      expect(result).toBe(
        "http://localhost:9000/bucket/a/b/c/d/e/f/data.zarr",
      );
    });

    test("handles bucket name with dots", () => {
      const config = {
        name: "my.bucket.name",
        region: "us-west-2",
        endpoint: "",
      };

      const result = constructS3Url(config, "data.zarr");

      expect(result).toBe(
        "https://my.bucket.name.s3.us-west-2.amazonaws.com/data.zarr",
      );
    });
  });
});
