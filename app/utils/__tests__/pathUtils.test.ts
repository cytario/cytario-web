import { describe, expect, test } from "vitest";

import {
  ConnectionPrefixError,
  getName,
  getPrefix,
  prefixSchema,
  resolveConnectionPrefix,
} from "~/utils/pathUtils";

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

  describe("resolveConnectionPrefix", () => {
    test("composes connPrefix + urlPath with trailing-slash prefix", () => {
      expect(resolveConnectionPrefix("scope", "sub/dir")).toEqual({
        urlPath: "sub/dir",
        pathName: "scope/sub/dir",
        prefix: "scope/sub/dir/",
      });
    });

    test("handles empty urlPath (connection root)", () => {
      expect(resolveConnectionPrefix("scope", "")).toEqual({
        urlPath: "",
        pathName: "scope",
        prefix: "scope/",
      });
    });

    test("handles empty connPrefix (whole-bucket connection)", () => {
      expect(resolveConnectionPrefix("", "sub")).toEqual({
        urlPath: "sub",
        pathName: "sub",
        prefix: "sub/",
      });
    });

    test("returns undefined prefix when both are empty", () => {
      expect(resolveConnectionPrefix("", "")).toEqual({
        urlPath: "",
        pathName: "",
        prefix: undefined,
      });
    });

    test("strips leading and trailing slashes from connPrefix", () => {
      expect(resolveConnectionPrefix("/scope/", "sub")).toMatchObject({
        pathName: "scope/sub",
      });
    });

    test("squashes empty segments and '.' segments", () => {
      expect(resolveConnectionPrefix("scope", "/sub//./dir/")).toMatchObject({
        urlPath: "sub/dir",
        pathName: "scope/sub/dir",
      });
    });

    test("rejects '..' segments anywhere in urlPath", () => {
      expect(() => resolveConnectionPrefix("scope", "..")).toThrow(ConnectionPrefixError);
      expect(() => resolveConnectionPrefix("scope", "sub/..")).toThrow(ConnectionPrefixError);
      expect(() => resolveConnectionPrefix("scope", "../etc")).toThrow(ConnectionPrefixError);
      expect(() => resolveConnectionPrefix("scope", "a/../../b")).toThrow(ConnectionPrefixError);
    });

    test("does not reject keys that merely contain '..' as a substring", () => {
      expect(() => resolveConnectionPrefix("scope", "weird..name")).not.toThrow();
      expect(resolveConnectionPrefix("scope", "weird..name")).toMatchObject({
        pathName: "scope/weird..name",
      });
    });
  });

  describe("prefixSchema", () => {
    test("accepts empty string and ordinary paths", () => {
      expect(prefixSchema.safeParse("").success).toBe(true);
      expect(prefixSchema.safeParse("a/b/c").success).toBe(true);
    });

    test("rejects NUL, CR, LF", () => {
      expect(prefixSchema.safeParse("a\0b").success).toBe(false);
      expect(prefixSchema.safeParse("a\rb").success).toBe(false);
      expect(prefixSchema.safeParse("a\nb").success).toBe(false);
    });

    test("rejects strings longer than 1024 chars", () => {
      expect(prefixSchema.safeParse("a".repeat(1024)).success).toBe(true);
      expect(prefixSchema.safeParse("a".repeat(1025)).success).toBe(false);
    });
  });
});
