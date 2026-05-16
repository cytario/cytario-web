#!/usr/bin/env node
/* global process */
// Regenerate `@cytario/plugin-api`'s `src/version.ts` from the latest
// `plugin-api-v*` git tag — but only when the workspace source is
// present. Becomes a no-op inside a published `@cytario/web` install
// where the workspace source is not shipped.

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(HERE, "..", "packages", "plugin-api", "scripts", "write-version.mjs");

if (!existsSync(TARGET)) {
  // Published @cytario/web tarball — plugin-api source is not shipped.
  process.exit(0);
}

const result = spawnSync(process.execPath, [TARGET], { stdio: "inherit" });
process.exit(result.status ?? 0);
