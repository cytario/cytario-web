import {
  buildConnectionPath,
  constructS3Url,
  parseResourceId,
  toIndexS3Key,
} from "../resourceId";

describe("toIndexS3Key", () => {
  test("returns index key without prefix", () => {
    expect(toIndexS3Key()).toBe(".cytario/index.parquet");
  });

  test("returns index key with empty prefix", () => {
    expect(toIndexS3Key("")).toBe(".cytario/index.parquet");
  });

  test("returns index key with prefix", () => {
    expect(toIndexS3Key("data")).toBe("data/.cytario/index.parquet");
  });

  test("strips trailing slash from prefix", () => {
    expect(toIndexS3Key("data/images/")).toBe(
      "data/images/.cytario/index.parquet",
    );
  });

  test("handles nested prefix", () => {
    expect(toIndexS3Key("org/lab/experiment")).toBe(
      "org/lab/experiment/.cytario/index.parquet",
    );
  });
});

describe("parseResourceId", () => {
  test("parses connectionName and pathName", () => {
    expect(parseResourceId("my-conn/folder/file.txt")).toEqual({
      connectionName: "my-conn",
      pathName: "folder/file.txt",
    });
  });

  test("handles empty pathName", () => {
    expect(parseResourceId("my-conn/")).toEqual({
      connectionName: "my-conn",
      pathName: "",
    });
  });

  test("handles pathName with multiple slashes", () => {
    expect(parseResourceId("my-conn/a/b/c.parquet")).toEqual({
      connectionName: "my-conn",
      pathName: "a/b/c.parquet",
    });
  });

  test("throws on missing slash", () => {
    expect(() => parseResourceId("no-slash")).toThrow("Invalid resourceId");
  });

  test("throws on empty connectionName", () => {
    expect(() => parseResourceId("/path")).toThrow("empty connectionName");
  });
});

describe("buildConnectionPath", () => {
  test("returns connection path with empty pathName", () => {
    expect(buildConnectionPath("my-conn", "")).toBe("/connections/my-conn");
  });

  test("returns connection path with pathName", () => {
    expect(buildConnectionPath("my-conn", "folder/file.txt")).toBe(
      "/connections/my-conn/folder/file.txt",
    );
  });

  test("strips trailing slash", () => {
    expect(buildConnectionPath("my-conn", "folder/")).toBe("/connections/my-conn/folder");
  });
});

describe("constructS3Url", () => {
  describe("AWS S3 URLs", () => {
    test("constructs virtual-hosted style URL with region", () => {
      const config = {
        bucketName: "my-bucket",
        region: "us-west-2",
        endpoint: "",
      };

      const result = constructS3Url(config, "images/sample.zarr");

      expect(result).toBe(
        "https://my-bucket.s3.us-west-2.amazonaws.com/images/sample.zarr",
      );
    });

    test("uses eu-central-1 as default region", () => {
      const config = {
        bucketName: "my-bucket",
        region: null,
        endpoint: "",
      };

      const result = constructS3Url(config, "data.zarr");

      expect(result).toBe(
        "https://my-bucket.s3.eu-central-1.amazonaws.com/data.zarr",
      );
    });

    test("handles path with trailing slash", () => {
      const config = {
        bucketName: "bucket",
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
        bucketName: "my-bucket",
        endpoint: "http://localhost:9000",
        region: null,
      };

      const result = constructS3Url(config, "data.zarr");

      expect(result).toBe("http://localhost:9000/my-bucket/data.zarr");
    });

    test("strips trailing slash from endpoint", () => {
      const config = {
        bucketName: "bucket",
        endpoint: "http://localhost:9000/",
        region: null,
      };

      const result = constructS3Url(config, "images/sample.zarr");

      expect(result).toBe("http://localhost:9000/bucket/images/sample.zarr");
    });

    test("handles HTTPS custom endpoint", () => {
      const config = {
        bucketName: "bucket",
        endpoint: "https://minio.example.com",
        region: null,
      };

      const result = constructS3Url(config, "data.zarr");

      expect(result).toBe("https://minio.example.com/bucket/data.zarr");
    });

    test("handles R2 endpoint", () => {
      const config = {
        bucketName: "my-r2-bucket",
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
        bucketName: "bucket",
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
        bucketName: "bucket",
        region: "us-east-1",
        endpoint: "",
      };

      const result = constructS3Url(config, "");

      expect(result).toBe("https://bucket.s3.us-east-1.amazonaws.com/");
    });

    test("handles deeply nested path", () => {
      const config = {
        bucketName: "bucket",
        endpoint: "http://localhost:9000",
        region: null,
      };

      const result = constructS3Url(config, "a/b/c/d/e/f/data.zarr");

      expect(result).toBe(
        "http://localhost:9000/bucket/a/b/c/d/e/f/data.zarr",
      );
    });

    test("falls back to path-style for AWS buckets whose name contains dots", () => {
      // Virtual-hosted style breaks TLS because the wildcard cert
      // `*.s3.<region>.amazonaws.com` only matches a single DNS label —
      // matches AWS SDK v3 behaviour for dotted buckets over HTTPS.
      const config = {
        bucketName: "my.bucket.name",
        region: "us-west-2",
        endpoint: "",
      };

      const result = constructS3Url(config, "data.zarr");

      expect(result).toBe(
        "https://s3.us-west-2.amazonaws.com/my.bucket.name/data.zarr",
      );
    });

    test("uses path-style for dotted AWS bucket with explicit amazonaws endpoint", () => {
      const config = {
        bucketName: "ultivue.cytario",
        region: "us-east-1",
        endpoint: "https://s3.us-east-1.amazonaws.com",
      };

      const result = constructS3Url(config, "USL-2023-52702-11.ome.tif");

      expect(result).toBe(
        "https://s3.us-east-1.amazonaws.com/ultivue.cytario/USL-2023-52702-11.ome.tif",
      );
    });
  });
});
