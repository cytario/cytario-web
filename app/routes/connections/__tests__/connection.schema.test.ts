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
    expect(connectionNameSchema.safeParse("vericura internal").success).toBe(
      true,
    );
    expect(connectionNameSchema.safeParse("lab 1 data").success).toBe(true);
  });

  test("accepts names with uppercase characters", () => {
    expect(connectionNameSchema.safeParse("MyBucket").success).toBe(true);
    expect(connectionNameSchema.safeParse("Vericura Internal").success).toBe(
      true,
    );
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
});
