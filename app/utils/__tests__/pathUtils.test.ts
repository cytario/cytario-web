import { describe, expect, test } from "vitest";

import { getPrefix, getName } from "~/utils/pathUtils";

describe("pathUtils", () => {
  describe("getPrefix", () => {
    test("should return undefined for undefined path", () => {
      expect(getPrefix(undefined)).toBeUndefined();
    });

    test("should return undefined for empty string", () => {
      expect(getPrefix("")).toBeUndefined();
    });

    test("should return path as-is if it ends with /", () => {
      expect(getPrefix("folder/")).toBe("folder/");
      expect(getPrefix("deeply/nested/folder/")).toBe("deeply/nested/folder/");
    });

    test("should add trailing slash if path doesn't end with /", () => {
      expect(getPrefix("folder")).toBe("folder/");
      expect(getPrefix("deeply/nested/folder")).toBe("deeply/nested/folder/");
    });
  });

  describe("getName", () => {
    test("should return bucketName when path is undefined", () => {
      expect(getName(undefined, "my-bucket")).toBe("my-bucket");
    });

    test("should return empty string when both path and bucketName are undefined", () => {
      expect(getName(undefined, undefined)).toBe("");
    });

    test("should return empty string when path is empty and no bucketName", () => {
      expect(getName("", undefined)).toBe("");
    });

    test("should return last segment of path", () => {
      expect(getName("folder/file.txt")).toBe("file.txt");
      expect(getName("deeply/nested/folder/document.pdf")).toBe("document.pdf");
    });

    test("should handle path with trailing slash", () => {
      expect(getName("folder/subfolder/")).toBe("");
    });

    test("should handle single segment path", () => {
      expect(getName("filename.txt")).toBe("filename.txt");
    });

    test("should ignore bucketName when path is provided", () => {
      expect(getName("folder/file.txt", "ignored-bucket")).toBe("file.txt");
    });
  });
});