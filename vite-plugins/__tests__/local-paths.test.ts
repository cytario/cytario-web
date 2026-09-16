import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { buildLocalDevelopmentConfig, parseCytarioLocalPaths } from "../local-paths";

describe("parseCytarioLocalPaths", () => {
  test("returns empty for undefined env", () => {
    expect(parseCytarioLocalPaths(undefined)).toEqual({});
  });

  test("parses package names to absolute directories", () => {
    const parsed = parseCytarioLocalPaths('{"@cytario/czi-loader":"../czi-loader"}');
    expect(parsed).toEqual({ "@cytario/czi-loader": resolve("../czi-loader") });
  });

  test("rejects invalid JSON", () => {
    expect(() => parseCytarioLocalPaths("{oops")).toThrow(/not valid JSON/);
  });

  test("rejects non-object payloads", () => {
    expect(() => parseCytarioLocalPaths('["@cytario/czi-loader"]')).toThrow(/JSON object/);
    expect(() => parseCytarioLocalPaths("null")).toThrow(/JSON object/);
  });

  test("rejects invalid package names", () => {
    expect(() => parseCytarioLocalPaths('{"not a name":"/tmp"}')).toThrow(
      /Invalid npm package name/,
    );
  });

  test("rejects non-string or empty directories", () => {
    expect(() => parseCytarioLocalPaths('{"@cytario/design":42}')).toThrow(/non-empty directory/);
    expect(() => parseCytarioLocalPaths('{"@cytario/design":""}')).toThrow(/non-empty directory/);
  });
});

describe("buildLocalDevelopmentConfig", () => {
  test("returns inert config for no local paths", () => {
    const config = buildLocalDevelopmentConfig({});
    expect(config.resolve).toBeUndefined();
    expect(config.serverFsAllow).toEqual([]);
    expect(config.optimizeDepsExclude).toEqual([]);
    expect(config.ssrNoExternal).toEqual([]);
  });

  test("aliases the main entry to sibling src", () => {
    const { alias } = buildLocalDevelopmentConfig({
      "@cytario/czi-loader": "/repos/czi-loader",
    }).resolve!;
    const entry = alias.find((candidate) => candidate.find.test("@cytario/czi-loader"));
    expect(entry!.replacement).toBe("/repos/czi-loader/src/index.ts");
  });

  test("maps subpath imports onto the sibling tree", () => {
    const { alias } = buildLocalDevelopmentConfig({
      "@cytario/design": "/repos/cytario-design",
    }).resolve!;

    const resolveImport = (importSpecifier: string) => {
      const entry = alias.find((candidate) => candidate.find.test(importSpecifier));
      return importSpecifier.replace(entry!.find, entry!.replacement);
    };

    expect(resolveImport("@cytario/design")).toBe("/repos/cytario-design/src/index.ts");
    expect(resolveImport("@cytario/design/styles.css")).toBe(
      "/repos/cytario-design/dist/index.css",
    );
    expect(resolveImport("@cytario/design/styles/tokens.css")).toBe(
      "/repos/cytario-design/src/styles/tokens.css",
    );
    expect(alias.every((candidate) => !candidate.find.test("@cytario/other"))).toBe(true);
  });

  test("dedupes shared singletons and excludes locals from pre-bundling", () => {
    const config = buildLocalDevelopmentConfig({
      "@cytario/design": "/repos/cytario-design",
    });
    expect(config.resolve!.dedupe).toEqual([
      "react",
      "react-dom",
      "react-aria-components",
      "@cytario/plugin-api",
    ]);
    expect(config.optimizeDepsExclude).toEqual(["@cytario/design"]);
    expect(config.ssrNoExternal).toEqual(["@cytario/design"]);
    expect(config.serverFsAllow).toEqual(["/repos/cytario-design"]);
  });
});
