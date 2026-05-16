import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(HERE, "..", "bin", "cytario-web.mjs");

function run(args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

describe("bin/cytario-web", () => {
  test("--help prints usage and exits 0", () => {
    const result = run(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: cytario-web <command>");
    expect(result.stdout).toContain("build");
    expect(result.stdout).toContain("dev");
    expect(result.stdout).toContain("start");
    expect(result.stdout).toContain("CYTARIO_PLUGINS");
  });

  test("-h prints usage and exits 0", () => {
    const result = run(["-h"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: cytario-web <command>");
  });

  test("no args prints usage and exits 1", () => {
    const result = run([]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Usage: cytario-web <command>");
  });

  test("unknown command prints usage to stderr and exits 2", () => {
    const result = run(["bogus"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown command "bogus"');
    expect(result.stderr).toContain("Usage: cytario-web <command>");
  });
});
