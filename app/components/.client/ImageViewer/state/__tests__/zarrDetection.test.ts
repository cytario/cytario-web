/**
 * Tests for zarr detection logic used in ViewerStoreContext and objects.route.
 * These functions determine whether a URL/path points to a bioformats2raw zarr image.
 */

describe("isBioformatsZarr", () => {
  // Replicating the function from ViewerStoreContext for testing
  function isBioformatsZarr(url: string): boolean {
    return url.includes(".zarr");
  }

  describe("detection with .zarr extension", () => {
    test("detects URL ending with .zarr", () => {
      expect(
        isBioformatsZarr("https://bucket.s3.amazonaws.com/data.zarr")
      ).toBe(true);
    });

    test("detects URL ending with .zarr/", () => {
      expect(
        isBioformatsZarr("https://bucket.s3.amazonaws.com/image.zarr/")
      ).toBe(true);
    });

    test("detects URL with .zarr in path", () => {
      expect(
        isBioformatsZarr(
          "https://bucket.s3.amazonaws.com/images/sample.zarr/0/0/0"
        )
      ).toBe(true);
    });

    test("detects MinIO URL with .zarr", () => {
      expect(
        isBioformatsZarr("http://localhost:9000/bucket/USL-2023-52461-2.zarr")
      ).toBe(true);
    });

    test("detects AWS S3 virtual-hosted URL with .zarr", () => {
      expect(
        isBioformatsZarr(
          "https://my-bucket.s3.us-west-2.amazonaws.com/data.zarr"
        )
      ).toBe(true);
    });
  });

  describe("non-zarr URLs", () => {
    test("returns false for OME-TIFF files", () => {
      expect(
        isBioformatsZarr("https://bucket.s3.amazonaws.com/image.ome.tif")
      ).toBe(false);
    });

    test("returns false for regular TIFF files", () => {
      expect(
        isBioformatsZarr("https://bucket.s3.amazonaws.com/image.tiff")
      ).toBe(false);
    });

    test("returns false for parquet files", () => {
      expect(
        isBioformatsZarr("https://bucket.s3.amazonaws.com/data.parquet")
      ).toBe(false);
    });

    test("returns false for directory without .zarr extension", () => {
      expect(
        isBioformatsZarr(
          "https://bucket.s3.amazonaws.com/images/USL-2023-52461-2/"
        )
      ).toBe(false);
    });

    test("returns false for paths with 'zarr' as substring (no dot)", () => {
      // This is an edge case - "zarring" folder shouldn't match
      expect(
        isBioformatsZarr("https://bucket.s3.amazonaws.com/zarring/data")
      ).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("handles empty string", () => {
      expect(isBioformatsZarr("")).toBe(false);
    });

    test("handles URLs with query parameters", () => {
      expect(
        isBioformatsZarr("https://bucket.s3.amazonaws.com/data.zarr?version=1")
      ).toBe(true);
    });

    test("handles case sensitivity (.zarr vs .ZARR)", () => {
      // Currently case-sensitive - might want to change this
      expect(
        isBioformatsZarr("https://bucket.s3.amazonaws.com/data.ZARR")
      ).toBe(false);
    });
  });
});

describe("pathName zarr detection", () => {
  // Replicating the logic from objects.route.tsx loader
  function isZarrPath(pathName: string): boolean {
    return pathName.includes(".zarr");
  }

  describe("detection with .zarr extension", () => {
    test("detects path ending with .zarr", () => {
      expect(isZarrPath("images/sample.zarr")).toBe(true);
    });

    test("detects path ending with .zarr/", () => {
      expect(isZarrPath("images/sample.zarr/")).toBe(true);
    });

    test("detects nested zarr path", () => {
      expect(isZarrPath("experiments/2024/USL-2023-52461-2.zarr/0/0")).toBe(
        true
      );
    });

    test("detects zarr at root level", () => {
      expect(isZarrPath("data.zarr")).toBe(true);
    });
  });

  describe("non-zarr paths", () => {
    test("returns false for regular directory", () => {
      expect(isZarrPath("images/USL-2023-52461-2/")).toBe(false);
    });

    test("returns false for TIFF path", () => {
      expect(isZarrPath("images/sample.ome.tif")).toBe(false);
    });

    test("returns false for empty path", () => {
      expect(isZarrPath("")).toBe(false);
    });
  });
});

describe("constructS3Url", () => {
  // Replicating the function from objects.route.tsx
  interface BucketConfig {
    name: string;
    region?: string;
    endpoint?: string;
    provider: string;
  }

  function constructS3Url(
    bucketConfig: BucketConfig,
    pathName: string
  ): string {
    const bucket = bucketConfig.name;

    // Handle custom endpoints (MinIO, R2, etc.)
    if (bucketConfig.endpoint) {
      const endpoint = bucketConfig.endpoint.replace(/\/$/, "");
      return `${endpoint}/${bucket}/${pathName}`;
    }

    // Default to AWS S3 virtual-hosted style URL
    const region = bucketConfig.region || "us-east-1";
    return `https://${bucket}.s3.${region}.amazonaws.com/${pathName}`;
  }

  describe("AWS S3 URLs", () => {
    test("constructs virtual-hosted style URL with region", () => {
      const config: BucketConfig = {
        name: "my-bucket",
        region: "us-west-2",
        provider: "aws",
      };

      const result = constructS3Url(config, "images/sample.zarr");

      expect(result).toBe(
        "https://my-bucket.s3.us-west-2.amazonaws.com/images/sample.zarr"
      );
    });

    test("uses us-east-1 as default region", () => {
      const config: BucketConfig = {
        name: "my-bucket",
        provider: "aws",
      };

      const result = constructS3Url(config, "data.zarr");

      expect(result).toBe(
        "https://my-bucket.s3.us-east-1.amazonaws.com/data.zarr"
      );
    });

    test("handles path with trailing slash", () => {
      const config: BucketConfig = {
        name: "bucket",
        region: "eu-west-1",
        provider: "aws",
      };

      const result = constructS3Url(config, "images/sample.zarr/");

      expect(result).toBe(
        "https://bucket.s3.eu-west-1.amazonaws.com/images/sample.zarr/"
      );
    });
  });

  describe("Custom endpoint URLs (MinIO, R2)", () => {
    test("constructs URL with custom endpoint", () => {
      const config: BucketConfig = {
        name: "my-bucket",
        endpoint: "http://localhost:9000",
        provider: "minio",
      };

      const result = constructS3Url(config, "data.zarr");

      expect(result).toBe("http://localhost:9000/my-bucket/data.zarr");
    });

    test("strips trailing slash from endpoint", () => {
      const config: BucketConfig = {
        name: "bucket",
        endpoint: "http://localhost:9000/",
        provider: "minio",
      };

      const result = constructS3Url(config, "images/sample.zarr");

      expect(result).toBe("http://localhost:9000/bucket/images/sample.zarr");
    });

    test("handles HTTPS custom endpoint", () => {
      const config: BucketConfig = {
        name: "bucket",
        endpoint: "https://minio.example.com",
        provider: "minio",
      };

      const result = constructS3Url(config, "data.zarr");

      expect(result).toBe("https://minio.example.com/bucket/data.zarr");
    });

    test("handles R2 endpoint", () => {
      const config: BucketConfig = {
        name: "my-r2-bucket",
        endpoint: "https://account-id.r2.cloudflarestorage.com",
        provider: "r2",
      };

      const result = constructS3Url(config, "images/test.zarr");

      expect(result).toBe(
        "https://account-id.r2.cloudflarestorage.com/my-r2-bucket/images/test.zarr"
      );
    });

    test("ignores region when endpoint is provided", () => {
      const config: BucketConfig = {
        name: "bucket",
        region: "us-west-2",
        endpoint: "http://localhost:9000",
        provider: "minio",
      };

      const result = constructS3Url(config, "data.zarr");

      // Should use endpoint, not region-based AWS URL
      expect(result).toBe("http://localhost:9000/bucket/data.zarr");
      expect(result).not.toContain("s3.us-west-2");
    });
  });

  describe("edge cases", () => {
    test("handles empty path", () => {
      const config: BucketConfig = {
        name: "bucket",
        region: "us-east-1",
        provider: "aws",
      };

      const result = constructS3Url(config, "");

      expect(result).toBe("https://bucket.s3.us-east-1.amazonaws.com/");
    });

    test("handles deeply nested path", () => {
      const config: BucketConfig = {
        name: "bucket",
        endpoint: "http://localhost:9000",
        provider: "minio",
      };

      const result = constructS3Url(config, "a/b/c/d/e/f/data.zarr");

      expect(result).toBe("http://localhost:9000/bucket/a/b/c/d/e/f/data.zarr");
    });

    test("handles bucket name with dots", () => {
      const config: BucketConfig = {
        name: "my.bucket.name",
        region: "us-west-2",
        provider: "aws",
      };

      const result = constructS3Url(config, "data.zarr");

      expect(result).toBe(
        "https://my.bucket.name.s3.us-west-2.amazonaws.com/data.zarr"
      );
    });
  });
});
