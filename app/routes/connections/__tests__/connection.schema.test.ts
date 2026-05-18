import { describe, expect, test } from "vitest";

import {
  connectionSchema,
  connectionNameSchema,
  parseS3Uri,
  suggestName,
} from "../connection.schema";

describe("connectionNameSchema", () => {
  test("accepts valid lowercase alphanumeric names", () => {
    expect(connectionNameSchema.safeParse("my-bucket").success).toBe(true);
    expect(connectionNameSchema.safeParse("ab").success).toBe(true);
    expect(connectionNameSchema.safeParse("data123").success).toBe(true);
    expect(connectionNameSchema.safeParse("a-b-c").success).toBe(true);
  });

  test("accepts names with spaces", () => {
    expect(connectionNameSchema.safeParse("my bucket").success).toBe(true);
    expect(connectionNameSchema.safeParse("acme internal").success).toBe(true);
    expect(connectionNameSchema.safeParse("lab 1 data").success).toBe(true);
  });

  test("accepts names with uppercase characters", () => {
    expect(connectionNameSchema.safeParse("MyBucket").success).toBe(true);
    expect(connectionNameSchema.safeParse("Vericura Internal").success).toBe(true);
  });

  test("rejects names shorter than 2 characters", () => {
    const result = connectionNameSchema.safeParse("a");
    expect(result.success).toBe(false);
  });

  test("rejects names longer than 60 characters", () => {
    const result = connectionNameSchema.safeParse("a".repeat(61));
    expect(result.success).toBe(false);
  });

  test("rejects names with leading hyphens or spaces", () => {
    expect(connectionNameSchema.safeParse("-my-bucket").success).toBe(false);
    expect(connectionNameSchema.safeParse(" my-bucket").success).toBe(false);
  });

  test("rejects names with trailing hyphens or spaces", () => {
    expect(connectionNameSchema.safeParse("my-bucket-").success).toBe(false);
    expect(connectionNameSchema.safeParse("my-bucket ").success).toBe(false);
  });

  test("rejects names with consecutive hyphens", () => {
    const result = connectionNameSchema.safeParse("my--bucket");
    expect(result.success).toBe(false);
  });

  test("rejects names with consecutive spaces", () => {
    const result = connectionNameSchema.safeParse("my  bucket");
    expect(result.success).toBe(false);
  });

  test("rejects names with special characters", () => {
    const result = connectionNameSchema.safeParse("my_bucket");
    expect(result.success).toBe(false);
  });
});

describe("suggestName", () => {
  test("derives name from bucket name only", () => {
    expect(suggestName("my-bucket")).toBe("my-bucket");
  });

  test("derives name from s3:// prefixed URI", () => {
    expect(suggestName("s3://my-bucket")).toBe("my-bucket");
  });

  test("derives name from bucket name and last path segment", () => {
    expect(suggestName("my-bucket/data/images")).toBe("my-bucket images");
  });

  test("derives name from s3:// URI with last path segment", () => {
    expect(suggestName("s3://my-bucket/path/prefix")).toBe("my-bucket prefix");
  });

  test("preserves case", () => {
    expect(suggestName("MyBucket")).toBe("MyBucket");
  });

  test("replaces special characters with spaces", () => {
    expect(suggestName("my_bucket.test")).toBe("my bucket test");
  });

  test("collapses consecutive hyphens", () => {
    expect(suggestName("my---bucket")).toBe("my-bucket");
  });

  test("trims leading and trailing hyphens and spaces", () => {
    expect(suggestName("-my-bucket-")).toBe("my-bucket");
    expect(suggestName(" my bucket ")).toBe("my bucket");
  });

  test("returns empty string for empty input", () => {
    expect(suggestName("")).toBe("");
  });

  test("returns empty string for whitespace-only input", () => {
    expect(suggestName("   ")).toBe("");
  });

  test("truncates to 60 characters", () => {
    const longName = "a".repeat(70);
    expect(suggestName(longName).length).toBeLessThanOrEqual(60);
  });

  test("handles trailing slash in path", () => {
    expect(suggestName("my-bucket/data/")).toBe("my-bucket data");
  });

  test("handles s3:// URI with trailing slash", () => {
    expect(suggestName("s3://my-bucket/")).toBe("my-bucket");
  });
});

describe("parseS3Uri", () => {
  test("parses bucket name without prefix", () => {
    expect(parseS3Uri("my-bucket")).toEqual({
      bucketName: "my-bucket",
      prefix: "",
    });
  });

  test("parses bucket name with single-level prefix", () => {
    expect(parseS3Uri("my-bucket/data")).toEqual({
      bucketName: "my-bucket",
      prefix: "data",
    });
  });

  test("parses bucket name with multi-level prefix", () => {
    expect(parseS3Uri("my-bucket/data/images/raw")).toEqual({
      bucketName: "my-bucket",
      prefix: "data/images/raw",
    });
  });

  test("strips s3:// prefix before parsing", () => {
    expect(parseS3Uri("s3://my-bucket/data")).toEqual({
      bucketName: "my-bucket",
      prefix: "data",
    });
  });

  test("handles s3:// prefix with no path", () => {
    expect(parseS3Uri("s3://my-bucket")).toEqual({
      bucketName: "my-bucket",
      prefix: "",
    });
  });

  test("preserves trailing slash in prefix", () => {
    expect(parseS3Uri("my-bucket/data/")).toEqual({
      bucketName: "my-bucket",
      prefix: "data/",
    });
  });

  test("handles empty string", () => {
    expect(parseS3Uri("")).toEqual({
      bucketName: "",
      prefix: "",
    });
  });
});

describe("connectionSchema", () => {
  test("validates a complete AWS form submission", () => {
    const result = connectionSchema.safeParse({
      ownerScope: "user-123",
      providerType: "aws",
      s3Uri: "my-bucket/data",
      name: "my-bucket-data",
      bucketRegion: "eu-central-1",
      roleArn: "arn:aws:iam::123456789012:role/MyRole",
      bucketEndpoint: "",
    });
    expect(result.success).toBe(true);
  });

  test("validates a complete MinIO form submission", () => {
    const result = connectionSchema.safeParse({
      ownerScope: "user-123",
      providerType: "minio",
      s3Uri: "my-bucket",
      name: "my-bucket",
      bucketRegion: "",
      roleArn: "",
      bucketEndpoint: "https://s3.cytario.com",
    });
    expect(result.success).toBe(true);
  });

  test("rejects AWS form with missing name", () => {
    const result = connectionSchema.safeParse({
      ownerScope: "user-123",
      providerType: "aws",
      s3Uri: "my-bucket/data",
      name: "",
      bucketRegion: "eu-central-1",
      roleArn: "arn:aws:iam::123456789012:role/MyRole",
      bucketEndpoint: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects MinIO form with missing name", () => {
    const result = connectionSchema.safeParse({
      ownerScope: "user-123",
      providerType: "minio",
      s3Uri: "my-bucket",
      name: "",
      bucketRegion: "",
      roleArn: "",
      bucketEndpoint: "https://s3.cytario.com",
    });
    expect(result.success).toBe(false);
  });

  test("rejects AWS form with invalid Role ARN format", () => {
    const result = connectionSchema.safeParse({
      ownerScope: "user-123",
      providerType: "aws",
      s3Uri: "my-bucket",
      name: "my-bucket",
      bucketRegion: "eu-central-1",
      roleArn: "not-a-valid-arn",
      bucketEndpoint: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects AWS form with missing region", () => {
    const result = connectionSchema.safeParse({
      ownerScope: "user-123",
      providerType: "aws",
      s3Uri: "my-bucket",
      name: "my-bucket",
      bucketRegion: "",
      roleArn: "arn:aws:iam::123456789012:role/MyRole",
      bucketEndpoint: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects MinIO form with invalid endpoint URL", () => {
    const result = connectionSchema.safeParse({
      ownerScope: "user-123",
      providerType: "minio",
      s3Uri: "my-bucket",
      name: "my-bucket",
      bucketRegion: "",
      roleArn: "",
      bucketEndpoint: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  test("rejects MinIO form with missing endpoint", () => {
    const result = connectionSchema.safeParse({
      ownerScope: "user-123",
      providerType: "minio",
      s3Uri: "my-bucket",
      name: "my-bucket",
      bucketRegion: "",
      roleArn: "",
      bucketEndpoint: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects S3 URI with bucket name shorter than 3 characters", () => {
    const result = connectionSchema.safeParse({
      ownerScope: "user-123",
      providerType: "aws",
      s3Uri: "ab",
      name: "ab",
      bucketRegion: "eu-central-1",
      roleArn: "arn:aws:iam::123456789012:role/MyRole",
      bucketEndpoint: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects S3 URI whose prefix contains `*` (IAM wildcard)", () => {
    const result = connectionSchema.safeParse({
      ownerScope: "user-123",
      providerType: "aws",
      s3Uri: "shared-bucket/tenant-a*",
      name: "shared-tenant-a",
      bucketRegion: "eu-central-1",
      roleArn: "arn:aws:iam::123456789012:role/MyRole",
      bucketEndpoint: "",
    });
    expect(result.success).toBe(false);
    const errors = result.success ? {} : result.error.flatten().fieldErrors;
    expect(errors.s3Uri?.[0]).toMatch(/wildcard/i);
  });

  test("rejects S3 URI whose prefix contains `?` (IAM wildcard)", () => {
    const result = connectionSchema.safeParse({
      ownerScope: "user-123",
      providerType: "aws",
      s3Uri: "shared-bucket/tenant-?",
      name: "shared-tenant",
      bucketRegion: "eu-central-1",
      roleArn: "arn:aws:iam::123456789012:role/MyRole",
      bucketEndpoint: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects S3 URI with bucket name longer than 63 characters", () => {
    const longBucket = "a".repeat(64);
    const result = connectionSchema.safeParse({
      ownerScope: "user-123",
      providerType: "aws",
      s3Uri: longBucket,
      name: "long-bucket",
      bucketRegion: "eu-central-1",
      roleArn: "arn:aws:iam::123456789012:role/MyRole",
      bucketEndpoint: "",
    });
    expect(result.success).toBe(false);
  });

  test("accepts S3 URI with s3:// prefix in the value", () => {
    const result = connectionSchema.safeParse({
      ownerScope: "user-123",
      providerType: "aws",
      s3Uri: "s3://my-bucket/data",
      name: "my-bucket",
      bucketRegion: "eu-central-1",
      roleArn: "arn:aws:iam::123456789012:role/MyRole",
      bucketEndpoint: "",
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing ownerScope", () => {
    const result = connectionSchema.safeParse({
      ownerScope: "",
      providerType: "aws",
      s3Uri: "my-bucket",
      name: "my-bucket",
      bucketRegion: "eu-central-1",
      roleArn: "arn:aws:iam::123456789012:role/MyRole",
      bucketEndpoint: "",
    });
    expect(result.success).toBe(false);
  });

  describe("MinIO endpoint scheme — non-development", () => {
    // NODE_ENV is unset under vitest (see .env.test), so the schema runs
    // its non-development code path — http:// is rejected outside the
    // small loopback allowlist.

    test("rejects http:// endpoint pointing at a public host", () => {
      const result = connectionSchema.safeParse({
        ownerScope: "user-123",
        providerType: "minio",
        s3Uri: "my-bucket",
        name: "my-bucket",
        bucketRegion: "",
        roleArn: "",
        bucketEndpoint: "http://minio.example.com",
      });
      expect(result.success).toBe(false);
    });

    test("accepts https:// endpoint when host is in the S3 allowlist", () => {
      // `*.cytario.com` is built into `DEFAULT_S3_HOSTS`, so this host
      // is allowed without setting `CYTARIO_ALLOWED_S3_HOSTS`.
      const result = connectionSchema.safeParse({
        ownerScope: "user-123",
        providerType: "minio",
        s3Uri: "my-bucket",
        name: "my-bucket",
        bucketRegion: "",
        roleArn: "",
        bucketEndpoint: "https://minio.cytario.com",
      });
      expect(result.success).toBe(true);
    });

    test("rejects https:// endpoint whose host is not in the S3 allowlist", () => {
      const result = connectionSchema.safeParse({
        ownerScope: "user-123",
        providerType: "minio",
        s3Uri: "my-bucket",
        name: "my-bucket",
        bucketRegion: "",
        roleArn: "",
        bucketEndpoint: "https://minio.example.com",
      });
      expect(result.success).toBe(false);
      const message = result.success
        ? ""
        : (result.error.flatten().fieldErrors.bucketEndpoint?.[0] ?? "");
      expect(message).toMatch(/CYTARIO_ALLOWED_S3_HOSTS/);
    });

    test("rejects https:// endpoint pointing at AWS instance metadata (SSRF guard)", () => {
      const result = connectionSchema.safeParse({
        ownerScope: "user-123",
        providerType: "minio",
        s3Uri: "my-bucket",
        name: "my-bucket",
        bucketRegion: "",
        roleArn: "",
        bucketEndpoint: "https://169.254.169.254/latest/meta-data/",
      });
      expect(result.success).toBe(false);
    });

    test("rejects https:// endpoint pointing at RFC1918 host (SSRF guard)", () => {
      const result = connectionSchema.safeParse({
        ownerScope: "user-123",
        providerType: "minio",
        s3Uri: "my-bucket",
        name: "my-bucket",
        bucketRegion: "",
        roleArn: "",
        bucketEndpoint: "https://10.0.0.1",
      });
      expect(result.success).toBe(false);
    });

    test("allows http://localhost as a dev convenience", () => {
      const result = connectionSchema.safeParse({
        ownerScope: "user-123",
        providerType: "minio",
        s3Uri: "my-bucket",
        name: "my-bucket",
        bucketRegion: "",
        roleArn: "",
        bucketEndpoint: "http://localhost:9000",
      });
      expect(result.success).toBe(true);
    });

    test("allows http://127.0.0.1 as a dev convenience", () => {
      const result = connectionSchema.safeParse({
        ownerScope: "user-123",
        providerType: "minio",
        s3Uri: "my-bucket",
        name: "my-bucket",
        bucketRegion: "",
        roleArn: "",
        bucketEndpoint: "http://127.0.0.1:9000",
      });
      expect(result.success).toBe(true);
    });

    test("rejects http://*.internal hosts outside the loopback allowlist", () => {
      const result = connectionSchema.safeParse({
        ownerScope: "user-123",
        providerType: "minio",
        s3Uri: "my-bucket",
        name: "my-bucket",
        bucketRegion: "",
        roleArn: "",
        bucketEndpoint: "http://minio.cytario.internal",
      });
      expect(result.success).toBe(false);
    });
  });
});
