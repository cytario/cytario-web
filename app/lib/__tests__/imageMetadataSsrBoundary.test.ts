import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The image-metadata capability lives in app/lib/ (not .client/) and is wired
// from entry.client.tsx. If it ever statically imports the builtins module
// (or any loader/geotiff/viv module), those deps land in the entry bundle and,
// via the bootstrap import graph, the SSR bundle — which the build explicitly
// forbids. This guards the invariant without running a full build.
const moduleDir = dirname(fileURLToPath(import.meta.url));

test("imageMetadata has no static import of viewer-only heavy modules", () => {
  const source = readFileSync(resolve(moduleDir, "../imageMetadata.ts"), "utf8");

  const staticImports = source.match(/^import\s[^;]+;/gm) ?? [];
  const offending = staticImports.filter((line) =>
    /\.(client\/ImageViewer|loaders\/|formats\/builtins)/.test(line),
  );
  expect(offending).toEqual([]);

  const dynamicImports = source.match(/import\((["'`])[^)]+\1\)/g) ?? [];
  expect(dynamicImports.length).toBeGreaterThan(0);
  expect(dynamicImports.some((spec) => /formats\/builtins/.test(spec))).toBe(true);
});

test("the bootstrap import graph does not reach the image-metadata impl", () => {
  // The server entry imports bootstrapPluginsCore and plugins.generated; the
  // capability impl (which reaches the connections store and signed fetch)
  // must be reachable only from the client entry, not the shared bootstrap.
  const bootstrap = readFileSync(resolve(moduleDir, "../bootstrapPluginsCore.ts"), "utf8");
  expect(bootstrap).not.toMatch(/lib\/imageMetadata/);
  expect(bootstrap).toMatch(/ImageMetadataRegistry/);

  const entryClient = readFileSync(resolve(moduleDir, "../../entry.client.tsx"), "utf8");
  expect(entryClient).toMatch(/lib\/imageMetadata/);

  const entryServer = readFileSync(resolve(moduleDir, "../../entry.server.tsx"), "utf8");
  expect(entryServer).not.toMatch(/lib\/imageMetadata/);
});
