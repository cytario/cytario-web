import { InvalidPluginNameError, generatePluginsModule, parseCytarioPluginsEnv } from "../codegen";

describe("parseCytarioPluginsEnv", () => {
  test("undefined returns empty list", () => {
    expect(parseCytarioPluginsEnv(undefined)).toEqual({ plugins: [] });
  });

  test("empty string returns empty list", () => {
    expect(parseCytarioPluginsEnv("")).toEqual({ plugins: [] });
  });

  test("trims whitespace and ignores blank entries", () => {
    expect(parseCytarioPluginsEnv("  @cytario/czi-loader  , , foo  ")).toEqual({
      plugins: ["@cytario/czi-loader", "foo"],
    });
  });

  test("accepts scoped and unscoped npm names", () => {
    expect(parseCytarioPluginsEnv("@cytario/czi-loader,my-loader").plugins).toEqual([
      "@cytario/czi-loader",
      "my-loader",
    ]);
  });

  test.each([
    'a"; require("fs")',
    "@bad/name space",
    "@/missing-name",
    "BadCaps",
    "../etc/passwd",
    "../scary",
    "a\nb",
  ])("rejects invalid name: %s", (invalid) => {
    expect(() => parseCytarioPluginsEnv(invalid)).toThrow(InvalidPluginNameError);
  });
});

describe("generatePluginsModule", () => {
  test("empty plugin list produces a module with no static imports", () => {
    const out = generatePluginsModule({ plugins: [] });
    expect(out).toMatchSnapshot();
  });

  test("single plugin: identifier is index-derived (plugin_0)", () => {
    const out = generatePluginsModule({ plugins: ["@cytario/czi-loader"] });
    expect(out).toContain('import plugin_0 from "@cytario/czi-loader"');
    expect(out).toContain("plugin_0,");
    expect(out).toMatchSnapshot();
  });

  test("multiple plugins: identifiers count up by index", () => {
    const out = generatePluginsModule({ plugins: ["alpha", "beta", "gamma"] });
    expect(out).toContain('import plugin_0 from "alpha"');
    expect(out).toContain('import plugin_1 from "beta"');
    expect(out).toContain('import plugin_2 from "gamma"');
  });

  test("deterministic: identical input produces byte-identical output", () => {
    const input = { plugins: ["a", "b"] };
    expect(generatePluginsModule(input)).toBe(generatePluginsModule(input));
  });

  test("identifier mangling — raw env value never appears as an identifier", () => {
    // Per security model: package name strings appear only inside JSON.stringify
    // contexts (import path), never as a bare identifier. Validate by checking
    // that `plugin_` always immediately precedes the index in the emitted source.
    const out = generatePluginsModule({ plugins: ["weird-name"] });
    expect(out).toMatch(/import plugin_0 from "weird-name";/);
    expect(out).not.toMatch(/import weird-name/);
  });

  test("generated module delegates the iteration to bootstrapPluginsCore", () => {
    // Iteration logic (await register, apiVersion gate, per-plugin
    // try/catch) lives in app/lib/bootstrapPluginsCore.ts so it stays
    // unit-testable in isolation. The generated module's only job is to
    // bind the static plugin list to that helper.
    const out = generatePluginsModule({ plugins: ["any-plugin"] });
    expect(out).toContain('import { bootstrapPluginsCore } from "~/lib/bootstrapPluginsCore";');
    expect(out).toMatch(/return bootstrapPluginsCore\(plugins, logger, registries\);/);
  });
});
