import { Credentials } from "@aws-sdk/client-sts";
import { selectBundle, createWorker, AsyncDuckDB, ConsoleLogger } from "@duckdb/duckdb-wasm";

import { createSingleton } from "./createSingleton";
import { getLocalDuckDbBundles } from "./duckdbBundles";
import { escapeSqlString } from "./escapeSqlString";
import { shouldUseSSL, getEndpointHostname } from "../s3Provider";

/** The non-secret provider address DuckDB needs to reach the bucket. */
export interface DatabaseProvider {
  region?: string | null;
  endpoint?: string | null;
}

/** Initialize a DuckDB WASM connection with S3 support (singleton per resourceId). */
const createDatabaseInternal = async (resourceId: string, provider?: DatabaseProvider | null) => {
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

  // Always path-style: dotted bucket names break the vhost wildcard cert.
  const endpoint = provider?.endpoint;
  const region = provider?.region ?? "eu-central-1";
  const useSSL = shouldUseSSL(endpoint);
  const hostname = getEndpointHostname(endpoint);

  await connection.query(`SET s3_region='${escapeSqlString(region)}'`);
  await connection.query(`SET s3_endpoint='${escapeSqlString(hostname)}'`);
  await connection.query(`SET s3_url_style='path'`);
  await connection.query(`SET s3_use_ssl=${useSSL}`);

  console.info(`[createDatabase] DuckDB initialized (endpoint: ${hostname}, style: path)`);

  return connection;
};

type DuckDbConnection = Awaited<ReturnType<typeof createDatabaseInternal>>;

// Single-quote-escape every interpolated value — non-AWS providers may carry `'`.
// Shared with `convertCsvToParquet`, which bootstraps its own WASM instance.
export const applyS3Credentials = async (
  connection: Pick<DuckDbConnection, "query">,
  credentials: Credentials,
) => {
  const { AccessKeyId, SecretAccessKey, SessionToken } = credentials;
  await connection.query(`SET s3_access_key_id='${escapeSqlString(AccessKeyId ?? "")}'`);
  await connection.query(`SET s3_secret_access_key='${escapeSqlString(SecretAccessKey ?? "")}'`);
  await connection.query(`SET s3_session_token='${escapeSqlString(SessionToken ?? "")}'`);
};

const getConnection = createSingleton(createDatabaseInternal);

// Keyed by the connection itself so a rebuilt connection (singleton retries
// after a failed init) can never inherit a stale "already applied" verdict.
const appliedKeyIds = new WeakMap<DuckDbConnection, string | undefined>();

// Serialize `SET s3_*` per resourceId: two concurrent reads straddling a
// rotation would otherwise interleave their SET trios on the shared
// connection and leave a mismatched key/secret pair behind.
const pendingApplications = new Map<string, Promise<void>>();

/**
 * STS credentials rotate (~hourly, C-242) while the cached connection lives for
 * the whole viewer session — re-apply the `SET s3_*` trio whenever the caller
 * resolves a different `AccessKeyId` than the connection last saw.
 */
export const createDatabase = async (
  resourceId: string,
  credentials: Credentials,
  provider?: DatabaseProvider | null,
) => {
  const connection = await getConnection(resourceId, provider);

  const previous = pendingApplications.get(resourceId) ?? Promise.resolve();
  const application = previous.then(async () => {
    if (appliedKeyIds.get(connection) !== credentials.AccessKeyId) {
      await applyS3Credentials(connection, credentials);
      appliedKeyIds.set(connection, credentials.AccessKeyId);
    }
  });
  // Keep the chain alive past a failed application so the next caller retries.
  pendingApplications.set(
    resourceId,
    application.catch(() => {}),
  );
  await application;

  return connection;
};
