import { Credentials } from "@aws-sdk/client-sts";
import {
  getJsDelivrBundles,
  selectBundle,
  createWorker,
  AsyncDuckDB,
  ConsoleLogger,
} from "@duckdb/duckdb-wasm";

import { createSingleton } from "./createSingleton";
import { shouldUseSSL, getEndpointHostname } from "../s3Provider";
import { ConnectionConfig } from "~/.generated/client";

/**
 * Initialize DuckDB-WASM with S3 httpfs (singleton per `resourceId`).
 * @param resourceId      Singleton cache key (e.g. `connectionName`).
 * @param connectionConfig  Connection config; `null` for non-S3 setups.
 * @param enableObjectCache  Default `true`. Pass `false` when the parquet
 *                           is rewritten under the same URL (e.g. the
 *                           connection index) so the footer cache doesn't
 *                           serve stale data.
 */
const createDatabaseInternal = async (
  _resourceId: string,
  credentials: Credentials,
  connectionConfig?: ConnectionConfig | null,
  enableObjectCache = true,
) => {
  console.info("[createDatabase] Initializing DuckDB WASM with S3 support...");

  // Load DuckDB WASM bundle
  const JSDELIVR_BUNDLES = getJsDelivrBundles();
  const bundle = await selectBundle(JSDELIVR_BUNDLES);

  if (!bundle.mainWorker) {
    throw new Error("DuckDB WASM worker is not available");
  }

  const worker = await createWorker(bundle.mainWorker);
  const db = new AsyncDuckDB(new ConsoleLogger(4), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  const connection = await db.connect();

  // Use experimental HTTPFS for S3 access
  // see https://github.com/duckdb/duckdb-wasm/discussions/2107
  await connection.query("SET builtin_httpfs = false;");
  await connection.query("LOAD httpfs;");

  // Install and load spatial extension for geometry operations
  await connection.query("INSTALL spatial;");
  await connection.query("LOAD spatial;");

  // Object cache: parquet footer/schema reuse across queries. See
  // `CreateDatabaseOptions.enableObjectCache`. http_keep_alive is always
  // safe (just reuses the TCP socket; no parquet bytes are cached by it).
  await connection.query(
    `SET enable_object_cache = ${enableObjectCache};`,
  );
  await connection.query("SET http_keep_alive = true;");

  // Configure S3 credentials
  const { AccessKeyId, SecretAccessKey, SessionToken } = credentials;
  await connection.query(`SET s3_access_key_id='${AccessKeyId}'`);
  await connection.query(`SET s3_secret_access_key='${SecretAccessKey}'`);
  await connection.query(`SET s3_session_token='${SessionToken}'`);

  // Configure S3 endpoint. Always path-style: works for every bucket shape
  // (dotted names break the vhost wildcard cert `*.s3.<region>.amazonaws.com`)
  // and keeps a single URL form across AWS and S3-compatible endpoints.
  const endpoint = connectionConfig?.endpoint;
  const region = connectionConfig?.region ?? "eu-central-1";
  const useSSL = shouldUseSSL(endpoint);
  const hostname = getEndpointHostname(endpoint);

  await connection.query(`SET s3_region='${region}'`);
  await connection.query(`SET s3_endpoint='${hostname}'`);
  await connection.query(`SET s3_url_style='path'`);
  await connection.query(`SET s3_use_ssl=${useSSL}`);

  console.info(
    `[createDatabase] DuckDB initialized (endpoint: ${hostname}, style: path, objectCache: ${enableObjectCache})`,
  );

  return connection;
};

// Wrap with singleton pattern to prevent multiple initializations
export const createDatabase = createSingleton(createDatabaseInternal);
