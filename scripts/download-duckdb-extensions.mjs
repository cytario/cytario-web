#!/usr/bin/env node
/* global console, process, fetch, Buffer */
/**
 * Download the DuckDB-WASM extensions cytario relies on (httpfs, spatial)
 * for every WASM build variant the runtime might pick, and write them
 * under `public/duckdb-extensions/v<duckdb-version>/<platform>/...`.
 *
 * Why bundle:
 *   - Privacy: `INSTALL httpfs;` at session start otherwise leaks every
 *     user's IP + Referer to `extensions.duckdb.org` (Cloudflare). Same
 *     reason we removed the runtime `jsdelivr` fetch for the core WASM
 *     module (see `app/utils/db/duckdbBundles.ts`).
 *   - CSP: our `connect-src` allowlist intentionally excludes third-party
 *     CDNs; without local mirrors the page-load `INSTALL` blocks.
 *
 * Vite serves anything in `public/` from the document origin verbatim.
 * `createDatabase.ts` points DuckDB at this local mirror via
 *   `SET custom_extension_repository='<origin>/duckdb-extensions/';`
 * before issuing `INSTALL <ext>; LOAD <ext>;`. DuckDB then fetches
 *   `<repo>/v<version>/<platform>/<ext>.duckdb_extension.wasm`
 * which matches the upstream `extensions.duckdb.org` layout.
 *
 * Supply-chain trust:
 *   `allowUnsignedExtensions: true` in `createDatabase.ts` disables
 *   DuckDB's own signature check, so this script is the ONLY integrity
 *   gate on the wasm payload. `public/duckdb-extensions/checksums.json`
 *   pins a SHA-256 per `{version, platform, ext}`. Behaviour:
 *     - Missing checksum entry → fail. Operator must add the entry by
 *       hand at every DuckDB core version bump (reviewed in a diff).
 *     - Existing local file with matching hash → skip.
 *     - Existing local file with mismatched hash → refuse to overwrite
 *       and abort, so a poisoned mirror is loud, not silent.
 *     - Fresh download with mismatched hash → refuse to write to disk.
 *
 * The DuckDB CORE version bundled inside `@duckdb/duckdb-wasm` is pinned
 * here. The script aborts loudly when the duckdb-wasm major / minor
 * changes — a manual review (and probably a version bump here) is the
 * right response, not a silent re-download against an unverified URL.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

const DUCKDB_WASM_PACKAGE = resolve(
  REPO_ROOT,
  "node_modules",
  "@duckdb",
  "duckdb-wasm",
  "package.json",
);

// duckdb-wasm v1.32.x embeds DuckDB v1.4.3 (verified by `strings ./*.wasm`).
// Bump this constant when bumping duckdb-wasm to a release that targets a
// different DuckDB core.
const SUPPORTED_DUCKDB_WASM = "1.32.";
const DUCKDB_CORE_VERSION = "1.4.3";

const PLATFORMS = ["wasm_mvp", "wasm_eh", "wasm_threads"];
// `parquet` is autoloaded by DuckDB on the first `parquet_scan(...)` —
// must be mirrored alongside the explicitly INSTALLed extensions.
const EXTENSIONS = ["httpfs", "spatial", "parquet", "json"];

const UPSTREAM_REPO = "https://extensions.duckdb.org";
const OUTPUT_ROOT = resolve(REPO_ROOT, "public", "duckdb-extensions");
const CHECKSUMS_FILE = resolve(OUTPUT_ROOT, "checksums.json");

function checkVersion() {
  const pkg = JSON.parse(readFileSync(DUCKDB_WASM_PACKAGE, "utf8"));
  const v = pkg.version ?? "";
  if (!v.startsWith(SUPPORTED_DUCKDB_WASM)) {
    console.error(
      `[duckdb-extensions] @duckdb/duckdb-wasm@${v} is not in the supported range (${SUPPORTED_DUCKDB_WASM}*).`,
    );
    console.error(
      "[duckdb-extensions] Update DUCKDB_CORE_VERSION in scripts/download-duckdb-extensions.mjs after verifying the new mapping with `strings node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm | grep '^v1\\.'`.",
    );
    process.exit(1);
  }
}

function loadChecksums() {
  if (!existsSync(CHECKSUMS_FILE)) {
    throw new Error(
      `Missing ${CHECKSUMS_FILE}. The integrity manifest must exist before any download — populate it manually at every DuckDB core version bump.`,
    );
  }
  const raw = JSON.parse(readFileSync(CHECKSUMS_FILE, "utf8"));
  // Strip JSON-comment-style keys so callers can iterate values safely.
  const entries = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith("$")));
  return entries;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function downloadOne({ url, destination, key, expectedHash }) {
  if (existsSync(destination)) {
    const localHash = sha256(readFileSync(destination));
    if (localHash === expectedHash) {
      return { destination, key, skipped: true };
    }
    throw new Error(
      `[duckdb-extensions] integrity mismatch for ${key}: on-disk SHA-256 ${localHash} does not match checksums.json ${expectedHash}. Refusing to overwrite — delete the file manually after investigating.`,
    );
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url} — ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const downloadedHash = sha256(buf);
  if (downloadedHash !== expectedHash) {
    throw new Error(
      `[duckdb-extensions] integrity mismatch for ${key}: downloaded SHA-256 ${downloadedHash} does not match checksums.json ${expectedHash}. Refusing to write to disk.`,
    );
  }
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, buf);
  return { destination, key, skipped: false, bytes: buf.byteLength };
}

async function main() {
  checkVersion();
  const checksums = loadChecksums();

  const tasks = [];
  for (const platform of PLATFORMS) {
    for (const ext of EXTENSIONS) {
      const key = `v${DUCKDB_CORE_VERSION}/${platform}/${ext}`;
      const expectedHash = checksums[key];
      if (!expectedHash) {
        // Fail loudly: an operator bumping the DuckDB version must
        // populate checksums.json by hand so the diff documents the
        // new trust anchor. Silent allow would defeat the integrity gate.
        throw new Error(
          `[duckdb-extensions] no checksum entry for ${key} in public/duckdb-extensions/checksums.json. Populate it manually after verifying the upstream binary, then re-run.`,
        );
      }
      const path = `/v${DUCKDB_CORE_VERSION}/${platform}/${ext}.duckdb_extension.wasm`;
      tasks.push({
        url: `${UPSTREAM_REPO}${path}`,
        destination: resolve(
          OUTPUT_ROOT,
          `v${DUCKDB_CORE_VERSION}`,
          platform,
          `${ext}.duckdb_extension.wasm`,
        ),
        key,
        expectedHash,
      });
    }
  }

  // L-C: parallelize. `Promise.all` does not preserve console-log order,
  // but each line is self-describing (it carries the destination path),
  // so an operator reading the output can still tell which file did what.
  const results = await Promise.all(tasks.map(downloadOne));

  let downloaded = 0;
  let skipped = 0;
  for (const result of results) {
    if (result.skipped) {
      skipped++;
    } else {
      downloaded++;
      console.log(
        `[duckdb-extensions] ${result.bytes} bytes → ${result.destination.replace(REPO_ROOT + "/", "")}`,
      );
    }
  }

  if (downloaded > 0) {
    console.log(
      `[duckdb-extensions] downloaded ${downloaded} extension(s), skipped ${skipped} (already present, integrity verified)`,
    );
  }
}

main().catch((err) => {
  console.error(`[duckdb-extensions] ${err.message}`);
  process.exit(1);
});
