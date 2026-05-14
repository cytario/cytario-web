#!/usr/bin/env tsx
/**
 * CI guard: regenerates `app/plugins.generated.ts` from CANONICAL_PLUGINS
 * and diffs against the committed file. Ignores CYTARIO_PLUGINS env so a
 * locally-set value cannot make CI green only on the developer's machine.
 * When the canonical set changes, bump CANONICAL_PLUGINS and the committed
 * file together.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GENERATED_PATH, generatePluginsModule } from "../bin-src/codegen";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const FULL_PATH = resolve(ROOT, GENERATED_PATH);

/**
 * Canonical plugin set for the committed `app/plugins.generated.ts`.
 * Empty in the upstream host — downstream assemblers set
 * `CYTARIO_PLUGINS` at build time and regenerate locally (not committed).
 */
const CANONICAL_PLUGINS: ReadonlyArray<string> = [];

function main(): number {
  const expected = generatePluginsModule({ plugins: CANONICAL_PLUGINS });

  if (!existsSync(FULL_PATH)) {
    console.error(`✗ Missing generated file: ${GENERATED_PATH}`);
    return 1;
  }

  const actual = readFileSync(FULL_PATH, "utf8");
  if (actual !== expected) {
    console.error(
      `✗ Generated file is stale: ${GENERATED_PATH}\n` +
        `  Canonical plugin set: ${JSON.stringify(CANONICAL_PLUGINS)}\n` +
        `  Hand-edited content or a stale CYTARIO_PLUGINS=... build will\n` +
        `  trigger this. Restore the committed file by running:\n\n` +
        `    npx tsx -e 'import { generatePluginsModule } from "./bin-src/codegen";\n` +
        `      import { writeFileSync } from "node:fs";\n` +
        `      writeFileSync("app/.generated/plugins.ts", generatePluginsModule({ plugins: [] }));\n` +
        `    '`,
    );
    return 1;
  }

  return 0;
}

process.exit(main());
