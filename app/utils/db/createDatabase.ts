import { Credentials } from "@aws-sdk/client-sts";
import { selectBundle, createWorker, AsyncDuckDB, ConsoleLogger } from "@duckdb/duckdb-wasm";

import { applyS3Credentials } from "./csvCredentials";
import { getLocalDuckDbBundles } from "./duckdbBundles";
import { escapeSqlString } from "./escapeSqlString";
import { shouldUseSSL, getEndpointHostname } from "../s3Provider";

/** The non-secret provider address DuckDB needs to reach the bucket. */
export interface DatabaseProvider {
  region?: string | null;
  endpoint?: string | null;
}

/** Initialize a DuckDB WASM connection with S3 support (LRU-bounded per resourceId). */
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

  return { connection, db };
};

type DuckDbHandle = Awaited<ReturnType<typeof createDatabaseInternal>>;

// Keyed by the connection itself so a rebuilt connection (singleton retries
// after a failed init) can never inherit a stale "already applied" verdict.
const appliedKeyIds = new WeakMap<DuckDbHandle["connection"], string | undefined>();

// Serialize `SET s3_*` per resourceId: two concurrent reads straddling a
// rotation would otherwise interleave their SET trios on the shared
// connection and leave a mismatched key/secret pair behind.
const pendingApplications = new Map<string, Promise<void>>();

/**
 * Open DuckDB instances kept alive: each carries a WASM worker + heap, so one
 * per viewed resource accumulates until the tab OOMs. LRU-bounded.
 *
 * Eviction is borrow-safe: a handle with outstanding borrows is never
 * terminated under in-flight queries — it is marked evicted and terminated
 * once the last borrower releases it. A re-request of a drained-but-not-yet-
 * terminated (or still-borrowed) evicted handle resurrects it instead of
 * spinning up a fresh instance.
 */
const MAX_DUCKDB_INSTANCES = 3;

interface TrackedHandle {
  promise: Promise<DuckDbHandle>;
  borrows: number;
  evicted: boolean;
}

const openHandles = new Map<string, TrackedHandle>();
const evictedHandles = new Map<string, TrackedHandle>();

const terminateHandle = (tracked: TrackedHandle) =>
  void tracked.promise
    .then(async ({ connection, db }) => {
      appliedKeyIds.delete(connection);
      await connection.close();
      await db.terminate();
    })
    .catch(() => {
      // Termination best-effort; the worker dies with the tab anyway.
    });

/** Drop a failed-init handle from whichever map holds it, guarded by identity. */
function dropFailedHandle(resourceId: string, tracked: TrackedHandle) {
  if (openHandles.get(resourceId) === tracked) openHandles.delete(resourceId);
  if (evictedHandles.get(resourceId) === tracked) evictedHandles.delete(resourceId);
}

/** Insertion-order LRU: touch on use, evict the oldest beyond the cap. */
function evictBeyondCap() {
  while (openHandles.size > MAX_DUCKDB_INSTANCES) {
    const [evictId, tracked] = openHandles.entries().next().value!;
    openHandles.delete(evictId);
    if (tracked.borrows > 0) {
      // Queries are in flight — terminate on the last release instead.
      tracked.evicted = true;
      evictedHandles.set(evictId, tracked);
    } else {
      terminateHandle(tracked);
    }
  }
}

/**
 * STS credentials rotate (~hourly, C-242) while a cached connection lives for
 * the whole viewer session — re-apply the `SET s3_*` trio whenever the caller
 * resolves a different `AccessKeyId` than the connection last saw.
 *
 * Borrow contract: every successful call must be paired with exactly one
 * `releaseDatabase(resourceId)` once the caller's work on the connection is
 * done (a `try/finally` around all query work). A missing release pins the
 * handle — and once it is evicted, its worker — in memory for the session.
 */
export const createDatabase = async (
  resourceId: string,
  credentials: Credentials,
  provider?: DatabaseProvider | null,
) => {
  // Resurrect an evicted-but-alive handle (still borrowed, or awaiting its
  // deferred termination) rather than creating a duplicate instance whose
  // sibling the evicted one would keep in memory until it drains.
  let tracked = evictedHandles.get(resourceId);
  if (tracked) {
    evictedHandles.delete(resourceId);
    tracked.evicted = false;
    openHandles.set(resourceId, tracked);
    evictBeyondCap();
  }

  if (openHandles.has(resourceId)) {
    // LRU touch — this resourceId moves to most-recent.
    tracked = openHandles.get(resourceId)!;
    openHandles.delete(resourceId);
    openHandles.set(resourceId, tracked);
  } else {
    const handlePromise = createDatabaseInternal(resourceId, provider);
    const fresh: TrackedHandle = { promise: handlePromise, borrows: 0, evicted: false };
    tracked = fresh;
    openHandles.set(resourceId, fresh);
    evictBeyondCap();

    // A failed init must not stay cached in either map, whether eviction
    // parked it or it still sits live in the LRU.
    handlePromise.catch(() => dropFailedHandle(resourceId, fresh));
  }

  // Borrow before any await so an eviction triggered while this call is
  // still resolving the handle defers termination past this call's release.
  tracked.borrows += 1;

  let connection: DuckDbHandle["connection"];
  try {
    ({ connection } = await tracked.promise);
  } catch (error) {
    tracked.borrows = Math.max(0, tracked.borrows - 1);
    dropFailedHandle(resourceId, tracked);
    throw error;
  }

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

/**
 * Release a `createDatabase` borrow. The last release of an evicted handle
 * terminates it; a live (non-evicted) handle simply stays in the LRU.
 */
export const releaseDatabase = (resourceId: string): void => {
  let tracked = openHandles.get(resourceId);
  if (!tracked) tracked = evictedHandles.get(resourceId);
  if (!tracked) return;

  tracked.borrows = Math.max(0, tracked.borrows - 1);
  if (tracked.evicted && tracked.borrows === 0 && !openHandles.has(resourceId)) {
    evictedHandles.delete(resourceId);
    terminateHandle(tracked);
  }
};

/** Test-only: drop every tracked handle so each test starts from a clean LRU. */
export const __resetDuckDbHandlesForTests = () => {
  openHandles.clear();
  evictedHandles.clear();
  pendingApplications.clear();
};

// Re-exported for `convertCsvToParquet`, which bootstraps its own WASM instance.
export { applyS3Credentials } from "./csvCredentials";
