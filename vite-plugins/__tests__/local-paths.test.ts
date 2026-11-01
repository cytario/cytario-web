import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
    expect(config.optimizeDepsEntries).toEqual([]);
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

  test("excludes a local package's devNoOptimize deps from pre-bundling", () => {
    const dir = mkdtempSync(join(tmpdir(), "local-paths-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        cytario: { devNoOptimize: ["@spatialdata/core", "zarrextra"] },
      }),
    );
    const config = buildLocalDevelopmentConfig({ "@cytario/spatialdata-viewer": dir });
    expect(config.optimizeDepsExclude).toEqual([
      "@cytario/spatialdata-viewer",
      "@spatialdata/core",
      "zarrextra",
    ]);
  });

  test("ignores a malformed or absent devNoOptimize declaration", () => {
    const dir = mkdtempSync(join(tmpdir(), "local-paths-"));
    // No package.json at all — degrades to the plain behavior.
    const missing = buildLocalDevelopmentConfig({ "@cytario/x": dir });
    expect(missing.optimizeDepsExclude).toEqual(["@cytario/x"]);
    expect(missing.optimizeDepsEntries).toEqual([]);

    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ cytario: { devNoOptimize: "not-an-array" } }),
    );
    const malformed = buildLocalDevelopmentConfig({ "@cytario/x": dir });
    expect(malformed.optimizeDepsExclude).toEqual(["@cytario/x"]);
    expect(malformed.optimizeDepsEntries).toEqual([]);
  });

  test("feeds the excluded deps' resolved entries to the dep scanner", () => {
    // viewer declares a devNoOptimize dep installed in its own node_modules
    // the way a real install lays it out; the dep's dist entry must come
    // back as a scanner entry so its runtime graph is pre-bundled.
    const root = mkdtempSync(join(tmpdir(), "local-paths-"));
    const viewer = join(root, "viewer");
    const stack = join(root, "stack");
    mkdirSync(viewer); mkdirSync(join(stack, "dist"), { recursive: true });
    writeFileSync(
      join(viewer, "package.json"),
      JSON.stringify({
        dependencies: { "some-stack": "1.0.0" },
        cytario: { devNoOptimize: ["some-stack"] },
      }),
    );
    writeFileSync(
      join(stack, "package.json"),
      JSON.stringify({ main: "dist/index.js", exports: { ".": "./dist/index.js" } }),
    );
    writeFileSync(join(stack, "dist", "index.js"), "export {};");
    mkdirSync(join(viewer, "node_modules"));
    symlinkSync(stack, join(viewer, "node_modules", "some-stack"));

    const config = buildLocalDevelopmentConfig({ "@cytario/spatialdata-viewer": viewer });
    expect(config.optimizeDepsExclude).toEqual([
      "@cytario/spatialdata-viewer",
      "some-stack",
    ]);
    expect(config.optimizeDepsEntries).toEqual([join(stack, "dist", "index.js")]);
  });
  test("aliases declared shared runtime deps to one resolution", () => {
    const app = mkdtempSync(join(tmpdir(), "local-paths-app-"));
    const deck = join(app, "deck.gl");
    const meta = join(app, "meta");
    const viewer = join(app, "viewer");
    mkdirSync(deck); mkdirSync(join(meta, "dist"), { recursive: true }); mkdirSync(viewer);
    // app "installs" deck.gl at a known path
    mkdirSync(join(app, "node_modules", "deck.gl"), { recursive: true });
    writeFileSync(join(app, "node_modules", "deck.gl", "package.json"), JSON.stringify({ name: "deck.gl" }));
    // the sibling's package.json declares deck.gl as shared and "installs" the meta barrel
    writeFileSync(
      join(viewer, "package.json"),
      JSON.stringify({ cytario: { devSharedDeps: ["deck.gl", "some-barrel"] } }),
    );
    mkdirSync(join(viewer, "node_modules", "some-barrel"), { recursive: true });
    writeFileSync(
      join(viewer, "node_modules", "some-barrel", "package.json"),
      JSON.stringify({ name: "some-barrel", main: "dist/index.js" }),
    );
    mkdirSync(join(viewer, "node_modules", "some-barrel", "dist"), { recursive: true });
    writeFileSync(join(viewer, "node_modules", "some-barrel", "dist", "index.js"), "export {};");

    // appRequire resolves from process.cwd(); point it at the temp app dir by
    // constructing the config from within it is not possible here, so assert
    // the fallback path instead: some-barrel resolves from the sibling.
    const { resolve, serverFsAllow } = buildLocalDevelopmentConfig({ "@cytario/x": viewer });
    const alias = resolve!.alias;
    const barrel = alias.find((c) => c.find.test("some-barrel"));
    expect(barrel!.replacement).toContain(join(viewer, "node_modules", "some-barrel"));
    // the shared dep's resolution is allowed for fs access
    expect(serverFsAllow.some((d) => d.includes("some-barrel"))).toBe(true);
    // the sibling itself still aliases to src
    const entry = alias.find((c) => c.find.test("@cytario/x"));
    expect(entry!.replacement).toBe(join(viewer, "src", "index.ts"));
  });

});
