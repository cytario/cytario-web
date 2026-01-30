import { describe, it, expect } from "vitest";

import {
  createResourceId,
  parseResourceId,
  toS3Uri,
  getFileName,
  matchesExtension,
} from "./resourceId";

describe("resourceId utilities", () => {
  describe("createResourceId", () => {
    it("creates a resourceId from provider, bucket and path", () => {
      expect(createResourceId("aws", "my-bucket", "data/file.csv")).toBe(
        "aws/my-bucket/data/file.csv",
      );
    });

    it("handles empty path", () => {
      expect(createResourceId("aws", "my-bucket", "")).toBe("aws/my-bucket/");
    });

    it("handles simple file path", () => {
      expect(createResourceId("minio", "bucket", "file.csv")).toBe(
        "minio/bucket/file.csv",
      );
    });
  });

  describe("parseResourceId", () => {
    it("parses a valid resourceId", () => {
      expect(parseResourceId("aws/my-bucket/data/file.csv")).toEqual({
        provider: "aws",
        bucketName: "my-bucket",
        pathName: "data/file.csv",
      });
    });

    it("parses resourceId with single file", () => {
      expect(parseResourceId("minio/bucket/file.csv")).toEqual({
        provider: "minio",
        bucketName: "bucket",
        pathName: "file.csv",
      });
    });

    it("parses resourceId with empty path", () => {
      expect(parseResourceId("aws/bucket/")).toEqual({
        provider: "aws",
        bucketName: "bucket",
        pathName: "",
      });
    });

    it("throws on missing second separator", () => {
      expect(() => parseResourceId("invalid/nobucket")).toThrow(
        "expected format provider/bucketName/pathName",
      );
    });

    it("throws on empty provider", () => {
      expect(() => parseResourceId("/bucket/path")).toThrow("empty provider");
    });

    it("throws on empty bucket name", () => {
      expect(() => parseResourceId("aws//path")).toThrow("empty bucket name");
    });
  });

  describe("toS3Uri", () => {
    it("creates S3 URI without provider", () => {
      expect(toS3Uri("aws/bucket/path/file.csv")).toBe(
        "s3://bucket/path/file.csv",
      );
    });
  });

  describe("getFileName", () => {
    it("extracts file name from deep path", () => {
      expect(getFileName("aws/bucket/path/to/file.csv")).toBe("file.csv");
    });

    it("extracts file name from shallow path", () => {
      expect(getFileName("aws/bucket/file.csv")).toBe("file.csv");
    });
  });

  describe("matchesExtension", () => {
    it("matches tiff files", () => {
      expect(matchesExtension("aws/bucket/file.tif", /\.(tif|tiff)$/i)).toBe(
        true,
      );
      expect(matchesExtension("aws/bucket/file.TIFF", /\.(tif|tiff)$/i)).toBe(
        true,
      );
    });

    it("does not match non-tiff files", () => {
      expect(matchesExtension("aws/bucket/file.csv", /\.(tif|tiff)$/i)).toBe(
        false,
      );
    });

    it("matches parquet files", () => {
      expect(matchesExtension("aws/bucket/data.parquet", /\.parquet$/i)).toBe(
        true,
      );
    });
  });
});
