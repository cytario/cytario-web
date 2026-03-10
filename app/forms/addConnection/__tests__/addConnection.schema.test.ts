import { describe, expect, test } from "vitest";

import {
  addConnectionSchema,
  aliasSchema,
  suggestAlias,
} from "../addConnection.schema";

describe("aliasSchema", () => {
  test("accepts valid lowercase alphanumeric aliases", () => {
    expect(aliasSchema.safeParse("my-bucket").success).toBe(true);
    expect(aliasSchema.safeParse("ab").success).toBe(true);
    expect(aliasSchema.safeParse("data123").success).toBe(true);
    expect(aliasSchema.safeParse("a-b-c").success).toBe(true);
  });

  test("accepts aliases with spaces", () => {
    expect(aliasSchema.safeParse("my bucket").success).toBe(true);
    expect(aliasSchema.safeParse("vericura internal").success).toBe(true);
    expect(aliasSchema.safeParse("lab 1 data").success).toBe(true);
  });

  test("accepts aliases with uppercase characters", () => {
    expect(aliasSchema.safeParse("MyBucket").success).toBe(true);
    expect(aliasSchema.safeParse("Vericura Internal").success).toBe(true);
  });

  test("rejects aliases shorter than 2 characters", () => {
    const result = aliasSchema.safeParse("a");
    expect(result.success).toBe(false);
  });

  test("rejects aliases longer than 60 characters", () => {
    const result = aliasSchema.safeParse("a".repeat(61));
    expect(result.success).toBe(false);
  });

  test("rejects aliases with leading hyphens or spaces", () => {
    expect(aliasSchema.safeParse("-my-bucket").success).toBe(false);
    expect(aliasSchema.safeParse(" my-bucket").success).toBe(false);
  });

  test("rejects aliases with trailing hyphens or spaces", () => {
    expect(aliasSchema.safeParse("my-bucket-").success).toBe(false);
    expect(aliasSchema.safeParse("my-bucket ").success).toBe(false);
  });

  test("rejects aliases with consecutive hyphens", () => {
    const result = aliasSchema.safeParse("my--bucket");
    expect(result.success).toBe(false);
  });

  test("rejects aliases with consecutive spaces", () => {
    const result = aliasSchema.safeParse("my  bucket");
    expect(result.success).toBe(false);
  });

  test("rejects aliases with special characters", () => {
    const result = aliasSchema.safeParse("my_bucket");
    expect(result.success).toBe(false);
  });
});

describe("suggestAlias", () => {
  test("derives alias from bucket name only", () => {
    expect(suggestAlias("my-bucket")).toBe("my-bucket");
  });

  test("derives alias from s3:// prefixed URI", () => {
    expect(suggestAlias("s3://my-bucket")).toBe("my-bucket");
  });

  test("derives alias from bucket name and last path segment", () => {
    expect(suggestAlias("my-bucket/data/images")).toBe("my-bucket images");
  });

  test("derives alias from s3:// URI with last path segment", () => {
    expect(suggestAlias("s3://my-bucket/path/prefix")).toBe(
      "my-bucket prefix",
    );
  });

  test("preserves case", () => {
    expect(suggestAlias("MyBucket")).toBe("MyBucket");
  });

  test("replaces special characters with spaces", () => {
    expect(suggestAlias("my_bucket.test")).toBe("my bucket test");
  });

  test("collapses consecutive hyphens", () => {
    expect(suggestAlias("my---bucket")).toBe("my-bucket");
  });

  test("trims leading and trailing hyphens and spaces", () => {
    expect(suggestAlias("-my-bucket-")).toBe("my-bucket");
    expect(suggestAlias(" my bucket ")).toBe("my bucket");
  });

  test("returns empty string for empty input", () => {
    expect(suggestAlias("")).toBe("");
  });

  test("returns empty string for whitespace-only input", () => {
    expect(suggestAlias("   ")).toBe("");
  });

  test("truncates to 60 characters", () => {
    const longName = "a".repeat(70);
    expect(suggestAlias(longName).length).toBeLessThanOrEqual(60);
  });
});

describe("addConnectionSchema", () => {
  test("validates a complete AWS form submission", () => {
    const result = addConnectionSchema.safeParse({
      ownerScope: "user-123",
      providerType: "aws",
      provider: "",
      s3Uri: "my-bucket/data",
      alias: "my-bucket-data",
      bucketRegion: "eu-central-1",
      roleArn: "arn:aws:iam::123456789012:role/MyRole",
      bucketEndpoint: "",
    });
    expect(result.success).toBe(true);
  });

  test("validates a complete Other provider form submission", () => {
    const result = addConnectionSchema.safeParse({
      ownerScope: "user-123",
      providerType: "other",
      provider: "minio",
      s3Uri: "my-bucket",
      alias: "my-bucket",
      bucketRegion: "",
      roleArn: "",
      bucketEndpoint: "http://localhost:9000",
    });
    expect(result.success).toBe(true);
  });

  test("rejects AWS form with missing alias", () => {
    const result = addConnectionSchema.safeParse({
      ownerScope: "user-123",
      providerType: "aws",
      provider: "",
      s3Uri: "my-bucket/data",
      alias: "",
      bucketRegion: "eu-central-1",
      roleArn: "arn:aws:iam::123456789012:role/MyRole",
      bucketEndpoint: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects Other form with missing alias", () => {
    const result = addConnectionSchema.safeParse({
      ownerScope: "user-123",
      providerType: "other",
      provider: "minio",
      s3Uri: "my-bucket",
      alias: "",
      bucketRegion: "",
      roleArn: "",
      bucketEndpoint: "http://localhost:9000",
    });
    expect(result.success).toBe(false);
  });
});
