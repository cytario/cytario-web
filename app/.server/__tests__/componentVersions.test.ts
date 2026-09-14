import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  __resetComponentVersions,
  getComponentVersions,
  type PackageResolver,
} from "../componentVersions";

let dir: string;
let envCache: Record<string, string | undefined>;

beforeEach(async () => {
  __resetComponentVersions();
  dir = await mkdtemp(path.join(tmpdir(), "component-versions-"));
  envCache = { ...process.env };
});

afterEach(async () => {
  process.env = envCache;
  __resetComponentVersions();
  await rm(dir, { recursive: true, force: true });
});

/** Writes a real manifest under the temp dir and returns a resolver for it. */
async function makeResolver(manifests: Record<string, string>): Promise<PackageResolver> {
  for (const [pkg, version] of Object.entries(manifests)) {
    const target = path.join(dir, pkg, "package.json");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify({ name: pkg, version }));
  }
  return (request) => path.join(dir, request);
}

describe("getComponentVersions", () => {
  test("reads assembly (ee), host, and plugin versions in an EE deployment", async () => {
    process.env.VERSION = "6.39.0";
    process.env.CYTARIO_PLUGINS = "@cytario/saas-plugin,@cytario/czi-loader";

    const versions = await getComponentVersions(
      await makeResolver({
        "@cytario/web": "6.2.0",
        "@cytario/saas-plugin": "1.4.0",
        "@cytario/czi-loader": "0.9.1",
      }),
    );

    expect(versions.assembly).toEqual({ package: "cytario-ee", version: "6.39.0" });
    expect(versions.components).toEqual([
      { package: "@cytario/web", version: "6.2.0" },
      { package: "@cytario/saas-plugin", version: "1.4.0" },
      { package: "@cytario/czi-loader", version: "0.9.1" },
    ]);
  });

  test("labels the assembly @cytario/web on the OSS build", async () => {
    process.env.VERSION = "6.2.0";
    delete process.env.CYTARIO_PLUGINS;

    const versions = await getComponentVersions(await makeResolver({}));

    expect(versions.assembly).toEqual({ package: "@cytario/web", version: "6.2.0" });
    expect(versions.components).toEqual([]);
  });

  test("skips packages without an installed manifest", async () => {
    process.env.VERSION = "6.39.0";
    process.env.CYTARIO_PLUGINS = "@cytario/czi-loader";

    const versions = await getComponentVersions(await makeResolver({ "@cytario/web": "6.2.0" }));

    expect(versions.components).toEqual([{ package: "@cytario/web", version: "6.2.0" }]);
  });

  test("rejects invalid plugin names rather than reading them", async () => {
    process.env.CYTARIO_PLUGINS = "not a valid npm name";

    await expect(getComponentVersions(await makeResolver({}))).rejects.toThrow();
  });
});
