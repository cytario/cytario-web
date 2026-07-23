#!/usr/bin/env node
/* global console, process, URL */
/**
 * Clone the DEV cytario-web database to a local database (schema + data).
 *
 * Usage:
 *   node scripts/clone-dev-db.mjs <source-url> <target-url>
 *
 *   source-url  — DEV DATABASE_URL (read source; may go through pgbouncer)
 *   target-url  — local DATABASE_URL (will be overwritten)
 *
 * Copies schema (tables, columns, enum types, defaults, PKs, unique constraints)
 * and data from the source, including the `_prisma_migrations` table so Prisma
 * knows which migrations are already applied. Run `prisma migrate deploy`
 * afterwards to apply any pending local migrations.
 *
 * Uses the `pg` driver (already a project dependency) instead of `pg_dump` /
 * `psql`, so it works through pgbouncer (transaction-pooling mode) where
 * `pg_dump` fails on session-level operations.
 *
 * Safety:
 *   - Refuses to operate on a target whose URL host resolves to a non-loopback
 *     address, to avoid clobbering a remote DB by mistake.
 *   - Requires an explicit confirmation if the target already has tables.
 */
import { lookup } from "node:dns/promises";
import pg from "pg";

const { Client } = pg;

function parsePgUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    fail(`invalid URL: ${url}`);
  }
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") {
    fail(`not a postgres URL: ${url}`);
  }
  const port = u.port || "5432";
  const database = (u.pathname || "/").slice(1);
  if (!database) fail(`URL has no database: ${url}`);
  return {
    url,
    host: u.hostname,
    port,
    database,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password || ""),
  };
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

async function resolveHost(host) {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return ["127.0.0.1"];
  }
  try {
    const records = await lookup(host, { all: true });
    return records.map((r) => r.address);
  } catch {
    fail(`cannot resolve host "${host}"`);
  }
}

const BATCH_SIZE = 500;

async function listTables(client) {
  const { rows } = await client.query(
    `SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname`,
  );
  return rows.map((r) => r.relname);
}

async function listEnums(client) {
  const { rows } = await client.query(
    `SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname`,
  );
  return rows.map((r) => ({ name: r.typname, labels: r.labels.split(",") }));
}

async function listColumns(client, table) {
  const { rows } = await client.query(
    `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
    a.attnotnull AS notnull,
    pg_get_expr(d.adbin, d.adrelid) AS default_expr
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = $1 AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum`,
    [table],
  );
  return rows;
}

async function listPrimaryKeys(client, table) {
  const { rows } = await client.query(
    `SELECT a.attname AS column_name
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = $1 AND i.indisprimary
    ORDER BY array_position(i.indkey, a.attnum)`,
    [table],
  );
  return rows.map((r) => r.column_name);
}

async function listUniqueConstraints(client, table) {
  const { rows } = await client.query(
    `SELECT con.conname, array_agg(a.attname ORDER BY array_position(con.conkey, a.attnum)) AS columns
    FROM pg_constraint con
    JOIN pg_class c ON con.conrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(con.conkey)
    WHERE n.nspname = 'public' AND c.relname = $1
    AND con.contype = 'u'
    GROUP BY con.conname`,
    [table],
  );
  return rows;
}

async function countRows(client, table) {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM "${table}"`);
  return rows[0].n;
}

async function listSequences(client) {
  // pg_sequences exposes every sequence in a schema with its full config.
  const { rows } = await client.query(
    `SELECT sequencename AS name, data_type, start_value::text AS start_value,
    min_value::text AS min_value, max_value::text AS max_value,
    increment_by::text AS increment, cycle, cache_size::text AS cache_size,
    last_value::text AS last_value
    FROM pg_sequences
    WHERE schemaname = 'public'`,
  );
  // Ownership: pg_depend rows with deptype = 'a' link a sequence to the
  // table.column it backs via a serial/bigserial DEFAULT. Prisma's
  // introspect and `prisma migrate diff` rely on this metadata.
  const { rows: ownRows } = await client.query(
    `SELECT c.relname AS seq_name,
    format('%I.%I', t.relname, a.attname) AS owned_by
    FROM pg_class c
    JOIN pg_depend d ON d.objid = c.oid AND d.classid = 'pg_class'::regclass
    JOIN pg_class t ON d.refobjid = t.oid
    JOIN pg_attribute a ON d.refobjid = a.attrelid AND d.refobjsubid = a.attnum
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relkind = 'S' AND d.deptype = 'a'`,
  );
  const ownerMap = new Map(ownRows.map((r) => [r.seq_name, r.owned_by]));
  return rows.map((r) => ({
    name: r.name,
    dataType: r.data_type,
    start: r.start_value,
    minValue: r.min_value,
    maxValue: r.max_value,
    increment: r.increment,
    cycle: r.cycle,
    cacheSize: r.cache_size,
    lastValue: r.last_value,
    ownedBy: ownerMap.get(r.name) ?? null,
  }));
}

async function copySequences(source, target) {
  const seqs = await listSequences(source);
  // Create bare sequences — table DDL references them via the DEFAULT
  // expression captured from pg_attrdef. Ownership is wired in a second
  // pass after tables exist (see linkSequenceOwnership).
  for (const s of seqs) {
    const cycle = s.cycle ? "CYCLE" : "NO CYCLE";
    // last_value is null for never-read sequences; fall back to start_value
    // so the sequence is usable immediately.
    const start = s.lastValue ?? s.start;
    await target.query(
      `CREATE SEQUENCE "${s.name}" AS ${s.dataType}
      INCREMENT BY ${s.increment}
      MINVALUE ${s.minValue}
      MAXVALUE ${s.maxValue}
      START WITH ${start}
      CACHE ${s.cacheSize}
         ${cycle}`,
    );
  }
  return seqs;
}

async function linkSequenceOwnership(source, target) {
  // Re-list rather than threading the seq array through main() so this
  // step stays self-contained and idempotent.
  const seqs = await listSequences(source);
  for (const s of seqs) {
    if (s.ownedBy) {
      await target.query(`ALTER SEQUENCE "${s.name}" OWNED BY ${s.ownedBy}`);
    }
  }
}

async function recreateSchema(target) {
  await target.query(`DROP SCHEMA IF EXISTS public CASCADE`);
  await target.query(`CREATE SCHEMA public`);
  await target.query(`GRANT ALL ON SCHEMA public TO public`);
}

function buildColumnDef(col) {
  let def = `"${col.name}" ${col.type}`;
  if (col.notnull) def += " NOT NULL";
  if (col.default_expr) def += ` DEFAULT ${col.default_expr}`;
  return def;
}

async function copyTable(source, target, table) {
  const columns = await listColumns(source, table);
  if (columns.length === 0) return 0;

  const colDefs = columns.map(buildColumnDef).join(", ");

  const pks = await listPrimaryKeys(source, table);
  let constraints = "";
  if (pks.length > 0) {
    constraints += `, PRIMARY KEY (${pks.map((c) => `"${c}"`).join(", ")})`;
  }

  const uniques = await listUniqueConstraints(source, table);
  for (const u of uniques) {
    const cols = u.columns.join(", ");
    constraints += `, CONSTRAINT "${u.conname}" UNIQUE (${cols})`;
  }

  await target.query(`CREATE TABLE "${table}" (${colDefs}${constraints})`);

  const colNames = columns.map((c) => `"${c.name}"`).join(", ");
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

  const total = await countRows(source, table);
  if (total === 0) return 0;

  let offset = 0;
  let inserted = 0;
  while (offset < total) {
    const { rows } = await source.query(
      `SELECT ${colNames} FROM "${table}" ORDER BY ctid LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset],
    );
    if (rows.length === 0) break;
    for (const row of rows) {
      const values = columns.map((c) => row[c.name]);
      await target.query(`INSERT INTO "${table}" (${colNames}) VALUES (${placeholders})`, values);
      inserted++;
    }
    offset += rows.length;
    if (offset % 5000 === 0 || offset >= total) {
      console.log(`  ${table}: ${offset}/${total} rows`);
    }
  }
  return inserted;
}

async function main() {
  const [sourceUrl, targetUrl] = process.argv.slice(2);
  if (!sourceUrl || !targetUrl) {
    fail("usage: node scripts/clone-dev-db.mjs <source-url> <target-url>");
  }

  const source = parsePgUrl(sourceUrl);
  const target = parsePgUrl(targetUrl);

  console.log(`source: ${source.user}@${source.host}:${source.port}/${source.database}`);
  console.log(`target: ${target.user}@${target.host}:${target.port}/${target.database}`);

  // Safety: refuse non-loopback targets.
  const targetAddrs = await resolveHost(target.host);
  for (const addr of targetAddrs) {
    if (!addr.startsWith("127.") && addr !== "::1") {
      fail(
        `target host "${target.host}" resolves to ${addr}, which is not loopback — refusing to clobber a remote database`,
      );
    }
  }

  const sourceClient = new Client({ ...source, ssl: false });
  const targetClient = new Client({ ...target, ssl: false });
  await sourceClient.connect();
  await targetClient.connect();

  // Safety: confirm if the target already has tables.
  let existingTables = [];
  try {
    existingTables = await listTables(targetClient);
  } catch (err) {
    fail(`cannot read target tables: ${err.message}`);
  }
  if (existingTables.length > 0) {
    console.error(`target has ${existingTables.length} table(s): ${existingTables.join(", ")}`);
    console.error("this operation will DROP them. Continue? [y/N]");
    const answer = await new Promise((resolve) => {
      process.stdin.resume();
      process.stdin.once("data", (d) => {
        process.stdin.pause();
        resolve(d.toString().trim().toLowerCase());
      });
    });
    if (answer !== "y" && answer !== "yes") {
      fail("aborted by user");
    }
  }

  console.log("recreating target schema…");
  await recreateSchema(targetClient);

  // Copy enum types first (tables may depend on them).
  console.log("copying enum types…");
  const enums = await listEnums(sourceClient);
  for (const { name, labels } of enums) {
    const labelList = labels.map((l) => `'${l.replace(/'/g, "''")}'`).join(", ");
    await targetClient.query(`CREATE TYPE "${name}" AS ENUM (${labelList})`);
  }

  // Copy sequences before tables — table DDL embeds DEFAULT nextval(...)
  // captured from pg_attrdef, which fails if the sequence doesn't exist.
  console.log("copying sequences…");
  const seqs = await copySequences(sourceClient, targetClient);
  console.log(`  ${seqs.length} sequence(s)`);

  // Copy tables (including _prisma_migrations so Prisma knows what's applied).
  console.log("copying tables…");
  const tables = await listTables(sourceClient);
  let totalRows = 0;
  for (const table of tables) {
    const n = await copyTable(sourceClient, targetClient, table);
    totalRows += n;
    console.log(`  ${table}: ${n} rows`);
  }

  // Now that every table exists, wire sequence → column ownership so
  // Prisma's introspect sees the serial binding.
  console.log("linking sequence ownership…");
  await linkSequenceOwnership(sourceClient, targetClient);

  await sourceClient.end();
  await targetClient.end();

  console.log(
    `done. ${tables.length} tables, ${seqs.length} sequences, ${totalRows} rows cloned from DEV to local.`,
  );
  console.log(
    "run `DATABASE_URL=<target-url> npx prisma migrate deploy` to apply any pending migrations.",
  );
}

main().catch((err) => {
  console.error(`FAIL: unexpected error ${err?.stack || err}`);
  process.exit(1);
});
