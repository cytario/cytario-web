import { Credentials } from "@aws-sdk/client-sts";
import {
  getJsDelivrBundles,
  selectBundle,
  createWorker,
  AsyncDuckDB,
  ConsoleLogger,
} from "@duckdb/duckdb-wasm";

import { createSingleton } from "./createSingleton";
import {
  getDuckDbUrlStyle,
  shouldUseSSL,
  getEndpointHostname,
} from "../s3Provider";
import { BucketConfig } from "~/.generated/client";

/**
 * Initialize DuckDB WASM with S3 support (singleton per resourceId)
 * @param resourceId - S3 resource identifier (bucketName/pathName)
 * @param credentials - AWS credentials
 * @param bucketConfig - Optional bucket configuration for S3-compatible services
 */
const createDatabaseInternal = async (
  resourceId: string,
  credentials: Credentials,
  bucketConfig?: BucketConfig | null,
) => {
  console.info("[getTileDataWasm] Initializing DuckDB WASM with S3 support...");

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

  // Enable caching for parquet metadata and HTTP connections
  await connection.query("SET enable_object_cache = true;");
  await connection.query("SET http_keep_alive = true;");

  // Configure S3 credentials
  // TODO: Use prepared statements or proper escaping for credential values
  const { AccessKeyId, SecretAccessKey, SessionToken } = credentials;
  await connection.query(`SET s3_access_key_id='${AccessKeyId}'`);
  await connection.query(`SET s3_secret_access_key='${SecretAccessKey}'`);
  await connection.query(`SET s3_session_token='${SessionToken}'`);

  // Configure S3 endpoint and URL style for S3-compatible services (MinIO, etc.)
  const endpoint = bucketConfig?.endpoint;
  const region = bucketConfig?.region ?? "eu-central-1";
  const urlStyle = getDuckDbUrlStyle(endpoint);
  const useSSL = shouldUseSSL(endpoint);
  const hostname = getEndpointHostname(endpoint);

  // TODO: Use prepared statements or proper escaping for config values
  await connection.query(`SET s3_region='${region}'`);
  await connection.query(`SET s3_endpoint='${hostname}'`);
  await connection.query(`SET s3_url_style='${urlStyle}'`);
  await connection.query(`SET s3_use_ssl=${useSSL}`);

  console.info(
    `[createDatabase] DuckDB initialized (endpoint: ${hostname}, style: ${urlStyle})`,
  );

  return connection;
};

// Wrap with singleton pattern to prevent multiple initializations
export const createDatabase = createSingleton(createDatabaseInternal);
