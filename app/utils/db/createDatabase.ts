import { Credentials } from "@aws-sdk/client-sts";
import { selectBundle, createWorker, AsyncDuckDB, ConsoleLogger } from "@duckdb/duckdb-wasm";

import { createSingleton } from "./createSingleton";
import { getLocalDuckDbBundles } from "./duckdbBundles";
import { escapeSqlString } from "./escapeSqlString";
import { shouldUseSSL, getEndpointHostname } from "../s3Provider";
import { ConnectionConfig } from "~/.generated/client";

/** Initialize a DuckDB WASM connection with S3 support (singleton per resourceId). */
const createDatabaseInternal = async (
  resourceId: string,
  credentials: Credentials,
  connectionConfig?: ConnectionConfig | null,
) => {
  console.info("[getTileDataWasm] Initializing DuckDB WASM with S3 support...");

  const bundle = await selectBundle(getLocalDuckDbBundles());

  if (!bundle.mainWorker) {
    throw new Error("DuckDB WASM worker is not available");
  }

  const worker = await createWorker(bundle.mainWorker);
  const db = new AsyncDuckDB(new ConsoleLogger(4), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  // Must be set before `open` (no SQL toggle). The mirror serves the same
  // upstream binary verified at build time, but signatures are tied to
  // `extensions.duckdb.org` so signature validation must be skipped.
  await db.open({ allowUnsignedExtensions: true });

  const connection = await db.connect();

  // Pin the extension loader at the cytario origin — going to
  // `extensions.duckdb.org` would leak the user's IP and is blocked by CSP.
  if (typeof window !== "undefined") {
    const repo = `${window.location.origin}/duckdb-extensions`;
    await connection.query(`SET custom_extension_repository='${repo}'`);
  }

  // Use experimental HTTPFS for S3 — see duckdb-wasm discussion #2107.
  await connection.query("SET builtin_httpfs = false;");
  await connection.query("LOAD httpfs;");

  await connection.query("SET enable_object_cache = true;");
  await connection.query("SET http_keep_alive = true;");

  // Single-quote-escape every interpolated value — non-AWS providers may carry `'`.
  const { AccessKeyId, SecretAccessKey, SessionToken } = credentials;
  await connection.query(`SET s3_access_key_id='${escapeSqlString(AccessKeyId ?? "")}'`);
  await connection.query(`SET s3_secret_access_key='${escapeSqlString(SecretAccessKey ?? "")}'`);
  await connection.query(`SET s3_session_token='${escapeSqlString(SessionToken ?? "")}'`);

  // Always path-style: dotted bucket names break the vhost wildcard cert.
  const endpoint = connectionConfig?.endpoint;
  const region = connectionConfig?.region ?? "eu-central-1";
  const useSSL = shouldUseSSL(endpoint);
  const hostname = getEndpointHostname(endpoint);

  await connection.query(`SET s3_region='${escapeSqlString(region)}'`);
  await connection.query(`SET s3_endpoint='${escapeSqlString(hostname)}'`);
  await connection.query(`SET s3_url_style='path'`);
  await connection.query(`SET s3_use_ssl=${useSSL}`);

  console.info(`[createDatabase] DuckDB initialized (endpoint: ${hostname}, style: path)`);

  return connection;
};

export const createDatabase = createSingleton(createDatabaseInternal);
