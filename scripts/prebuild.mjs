#!/usr/bin/env node
/* global process */
// Workspace-only build prep:
//   1. Regenerate `@cytario/plugin-api`'s `src/version.ts` from the latest
//      `plugin-api-v*` git tag.
//   2. Download the DuckDB-WASM extensions (httpfs, spatial) into
//      `public/duckdb-extensions/` so the runtime can `INSTALL` them from
//      the cytario origin instead of `extensions.duckdb.org`.
// Both steps become no-ops inside a published `@cytario/web` install where
// the workspace source is not shipped.

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function run(targetRelative) {
  const target = resolve(HERE, "..", targetRelative);
  if (!existsSync(target)) return 0;
  const result = spawnSync(process.execPath, [target], { stdio: "inherit" });
  return result.status ?? 0;
}

const versionStatus = run("packages/plugin-api/scripts/write-version.mjs");
if (versionStatus !== 0) process.exit(versionStatus);

const extensionsStatus = run("scripts/download-duckdb-extensions.mjs");
process.exit(extensionsStatus);
