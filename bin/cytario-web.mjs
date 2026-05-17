#!/usr/bin/env node
/* global process */
/**
 * `cytario-web` CLI. All subcommands run against this package's install
 * root and forward extra args to the underlying tool. The plugin set is
 * driven by `CYTARIO_PLUGINS` (comma-separated npm package names), which
 * the Vite codegen reads at build time. See USAGE below.
 */

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..");

const USAGE = `Usage: cytario-web <command> [...args]

Commands:
  build   Run the production build (prisma generate + codegen + react-router build)
  dev     Start the development server (prisma generate + codegen + react-router dev)
  start   Start the production server against the existing build/

Environment:
  CYTARIO_PLUGINS  Comma-separated npm package names to register as
                   format-handler plugins at build time. Empty means
                   the built-in OME-TIFF / OME-Zarr handlers only.
`;

function fail(message, code = 1) {
  process.stderr.write(`cytario-web: ${message}\n`);
  process.exit(code);
}

// `--no-install` rejects spawns whose binary isn't already resolvable
// from this package's deps — no silent network fetch at build time.
function spawnTool(args) {
  return new Promise((resolveSpawn, rejectSpawn) => {
    const child = spawn("npx", ["--no-install", ...args], {
      cwd: PACKAGE_ROOT,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        rejectSpawn(new Error(`signal ${signal}`));
        process.kill(process.pid, signal);
      } else if (code === 0) {
        resolveSpawn();
      } else {
        rejectSpawn(new Error(`exit ${code}`));
      }
    });
    child.on("error", rejectSpawn);
  });
}

// The published tarball excludes `app/.generated/`, so the Prisma
// client must be regenerated before any code that imports it runs.
function runPrismaGenerate() {
  return spawnTool(["prisma", "generate"]);
}

// `build` and `dev` share a pipeline: Prisma client, then react-router
// (whose Vite plugin reads CYTARIO_PLUGINS and writes
// `app/plugins.generated.ts`).
async function runReactRouterPipeline(subcommand, forwardedArgs) {
  try {
    await runPrismaGenerate();
    await spawnTool(["react-router", subcommand, ...forwardedArgs]);
    process.exit(0);
  } catch (err) {
    fail(`${subcommand} failed: ${err.message}`, 1);
  }
}

function runStart(forwardedArgs) {
  // Node 24 won't type-strip under `node_modules/`, so we spawn the
  // precompiled `server.js` (emitted by `npm run build:server`).
  const serverEntry = resolve(PACKAGE_ROOT, "server.js");
  if (!existsSync(serverEntry)) {
    fail(`missing server entry at ${serverEntry} — run \`npm run build:server\``);
  }
  const child = spawn(process.execPath, [serverEntry, ...forwardedArgs], {
    cwd: PACKAGE_ROOT,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

const [, , command, ...rest] = process.argv;

switch (command) {
  case "build":
    runReactRouterPipeline("build", rest);
    break;
  case "dev":
    runReactRouterPipeline("dev", rest);
    break;
  case "start":
    runStart(rest);
    break;
  case undefined:
  case "-h":
  case "--help":
    process.stdout.write(USAGE);
    process.exit(command === undefined ? 1 : 0);
  // falls through — process.exit terminates, switch never reaches default
  default:
    process.stderr.write(`cytario-web: unknown command "${command}"\n\n`);
    process.stderr.write(USAGE);
    process.exit(2);
}
