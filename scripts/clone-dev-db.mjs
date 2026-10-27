#!/usr/bin/env node
/* global Buffer, console, process, URL */
/**
 * Clone a source database to a local database (schema + data).
 *
 * Usage:
 *   node scripts/clone-dev-db.mjs <source-url> <target-url>
 *
 *   source-url  — source DATABASE_URL; must reach postgres directly. pg_dump
 *                 cannot run through the PgBouncer transaction pooler, so
 *                 connect to the primary instance (see the README section
 *                 "Cloning a database").
 *   target-url  — local DATABASE_URL; its public schema is dropped and
 *                 recreated from the dump.
 *
 * Streams pg_dump from the source into psql on the target, so tables, enum
 * types, sequences, defaults, constraints, unique indexes, and data (including
 * `_prisma_migrations`) land exactly as pg_dump serializes them. Requires
 * pg_dump/psql on PATH with a client major version >= the server's.
 * PGPASSWORD from the environment is honored by both; a password embedded in
 * the URL takes precedence.
 *
 * Safety: refuses to operate on a target whose URL host resolves to a
 * non-loopback address, to avoid clobbering a remote DB by mistake.
 */
import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function hostOf(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    fail(`invalid URL: ${url}`);
  }
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") {
    fail(`not a postgres URL: ${url}`);
  }
  return u.hostname;
}

async function assertLoopback(host) {
  const addrs =
    host === "localhost" || host === "127.0.0.1" || host === "::1"
      ? ["127.0.0.1"]
      : await lookup(host, { all: true })
          .then((records) => records.map((r) => r.address))
          .catch(() => fail(`cannot resolve host "${host}"`));
  for (const addr of addrs) {
    if (!addr.startsWith("127.") && addr !== "::1") {
      fail(
        `target host "${host}" resolves to ${addr}, which is not loopback — refusing to clobber a remote database`,
      );
    }
  }
}

function run(cmd, args, stdio) {
  const child = spawn(cmd, args, { stdio });
  const errors = [];
  child.stderr.on("data", (chunk) => errors.push(chunk));
  const done = new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", (err) => {
      errors.push(Buffer.from(`${cmd}: ${err.message}\n`));
      resolve(127);
    });
  });
  return { child, errors, done };
}

async function psql(targetUrl, args) {
  const { errors, done } = run(
    "psql",
    ["--no-psqlrc", "-v", "ON_ERROR_STOP=1", ...args, targetUrl],
    ["ignore", "pipe", "pipe"],
  );
  const code = await done;
  if (code !== 0) {
    fail(`psql exited with ${code}:\n${Buffer.concat(errors).toString()}`);
  }
}

async function main() {
  const [sourceUrl, targetUrl] = process.argv.slice(2);
  if (!sourceUrl || !targetUrl) {
    fail("usage: node scripts/clone-dev-db.mjs <source-url> <target-url>");
  }

  hostOf(sourceUrl);
  await assertLoopback(hostOf(targetUrl));

  console.log("resetting target schema…");
  await psql(targetUrl, [
    "-c",
    "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;",
  ]);

  console.log("streaming pg_dump → psql…");
  const dump = run(
    "pg_dump",
    ["--no-owner", "--no-privileges", sourceUrl],
    ["ignore", "pipe", "pipe"],
  );
  const restore = run(
    "psql",
    ["--no-psqlrc", "-v", "ON_ERROR_STOP=1", targetUrl],
    ["pipe", "pipe", "pipe"],
  );

  // psql dying early must not crash on the resulting broken pipe.
  dump.child.stdout.on("error", () => {});
  dump.child.stdout.pipe(restore.child.stdin);

  const [dumpCode, restoreCode] = [await dump.done, await restore.done];
  if (dumpCode !== 0) {
    fail(`pg_dump exited with ${dumpCode}:\n${Buffer.concat(dump.errors).toString()}`);
  }
  if (restoreCode !== 0) {
    fail(`psql exited with ${restoreCode}:\n${Buffer.concat(restore.errors).toString()}`);
  }

  console.log("done. local database now matches the source (schema + data).");
  console.log(
    "run `npx prisma migrate dev` against the target if your branch has migrations newer than the source.",
  );
}

main().catch((err) => {
  console.error(`FAIL: unexpected error ${err?.stack || err}`);
  process.exit(1);
});
