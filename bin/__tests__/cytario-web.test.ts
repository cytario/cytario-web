import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

// Copy the CLI into a throwaway dir so its computed PACKAGE_ROOT points
// at a controlled fixture, then exercise the server-entry resolution.
const CLI_SOURCE = resolve(__dirname, "..", "cytario-web.mjs");

describe("cytario-web CLI — start", () => {
  let fixtureRoot: string;
  let cliPath: string;

  beforeEach(() => {
    fixtureRoot = mkdtempSync(resolve(tmpdir(), "cytario-web-cli-"));
    const binDir = resolve(fixtureRoot, "bin");
    mkdirSync(binDir, { recursive: true });
    cliPath = resolve(binDir, "cytario-web.mjs");
    copyFileSync(CLI_SOURCE, cliPath);
  });

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  test("fails with a clear message when server.js is missing", () => {
    const result = spawnSync(process.execPath, [cliPath, "start"], {
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/missing server entry/);
    expect(result.stderr).toMatch(/server\.js/);
  });

  test("does not fall back to server.ts when only server.ts exists", () => {
    writeFileSync(resolve(fixtureRoot, "server.ts"), "console.log('should-not-run');\n");
    const result = spawnSync(process.execPath, [cliPath, "start"], {
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/missing server entry/);
  });

  test("spawns server.js when present", () => {
    writeFileSync(
      resolve(fixtureRoot, "server.js"),
      "process.stdout.write('server-js-ran');\nprocess.exit(0);\n",
    );
    const result = spawnSync(process.execPath, [cliPath, "start"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("server-js-ran");
  });
});
