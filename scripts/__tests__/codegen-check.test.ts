import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const GENERATED = resolve(ROOT, "app/plugins.generated.ts");

/**
 * Self-test of the codegen drift check (scripts/codegen-check.ts).
 *
 * Mutates the committed generated file in a temp copy, runs the script
 * against the mutated file, asserts non-zero exit. Restores the original
 * after each test.
 */
describe("codegen-check", () => {
  let originalContent: string;
  let tmpDir: string;

  beforeAll(() => {
    originalContent = readFileSync(GENERATED, "utf8");
    tmpDir = mkdtempSync(resolve(tmpdir(), "codegen-check-"));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    // Restore — every test should already have, but defense in depth.
    writeFileSync(GENERATED, originalContent, "utf8");
  });

  afterEach(() => {
    writeFileSync(GENERATED, originalContent, "utf8");
  });

  test("passes when the committed file matches the canonical output", () => {
    expect(() =>
      execFileSync("npx", ["tsx", "scripts/codegen-check.ts"], {
        cwd: ROOT,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  test("fails when the committed file diverges from the canonical output", () => {
    writeFileSync(GENERATED, originalContent + "\n// tampered\n", "utf8");
    expect(() =>
      execFileSync("npx", ["tsx", "scripts/codegen-check.ts"], {
        cwd: ROOT,
        stdio: "pipe",
      }),
    ).toThrow();
  });

  test("ignores CYTARIO_PLUGINS env — canonical set is hardcoded in the script", () => {
    // Setting CYTARIO_PLUGINS in CI must not change the comparison baseline;
    // otherwise a dev who set the env locally and committed plugins.ts would
    // make CI green only on machines with the same env. The script now
    // hardcodes the canonical empty list and ignores process.env.
    expect(() =>
      execFileSync("npx", ["tsx", "scripts/codegen-check.ts"], {
        cwd: ROOT,
        stdio: "pipe",
        env: { ...process.env, CYTARIO_PLUGINS: "some-other-plugin" },
      }),
    ).not.toThrow();
  });
});
