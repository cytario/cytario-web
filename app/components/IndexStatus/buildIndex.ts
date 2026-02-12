import {
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  S3Client,
} from "@aws-sdk/client-s3";
import { Credentials } from "@aws-sdk/client-sts";
import {
  getJsDelivrBundles,
  selectBundle,
  createWorker,
  AsyncDuckDB,
  ConsoleLogger,
} from "@duckdb/duckdb-wasm";

import { useIndexStore, IndexBuildProgress } from "./useIndexStore";
import { BucketConfig } from "~/.generated/client";
import { createS3ClientOptions } from "~/utils/s3Provider";

const MAX_KEYS = 1000;

export interface IndexObject {
  key: string;
  size: number;
  lastModified: Date;
  etag: string | null;
}

/**
 * Create S3 client for client-side use with temporary credentials
 */
function createS3Client(
  credentials: Credentials,
  bucketConfig: BucketConfig
): S3Client {
  const options = createS3ClientOptions(
    credentials,
    bucketConfig.region,
    bucketConfig.endpoint
  );
  return new S3Client(options);
}

/**
 * List all objects in a bucket with pagination, reporting progress
 */
async function listAllObjects(
  s3Client: S3Client,
  bucketName: string,
  onProgress: (loaded: number) => void
): Promise<IndexObject[]> {
  const objects: IndexObject[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      MaxKeys: MAX_KEYS,
      ContinuationToken: continuationToken,
    });

    const response: ListObjectsV2CommandOutput = await s3Client.send(command);

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key) {
          objects.push({
            key: obj.Key,
            size: obj.Size ?? 0,
            lastModified: obj.LastModified ?? new Date(),
            etag: obj.ETag ?? null,
          });
        }
      }
    }

    onProgress(objects.length);
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}

/**
 * Create DuckDB instance and populate with objects
 */
async function createIndexDatabase(
  bucketKey: string,
  objects: IndexObject[]
): Promise<void> {
  const store = useIndexStore.getState();

  // Initialize DuckDB
  const JSDELIVR_BUNDLES = getJsDelivrBundles();
  const bundle = await selectBundle(JSDELIVR_BUNDLES);

  if (!bundle.mainWorker) {
    throw new Error("DuckDB WASM worker is not available");
  }

  const worker = await createWorker(bundle.mainWorker);
  const db = new AsyncDuckDB(new ConsoleLogger(4), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  const connection = await db.connect();

  // Create the index table
  await connection.query(`
    CREATE TABLE bucket_index (
      key VARCHAR NOT NULL,
      size BIGINT NOT NULL,
      last_modified TIMESTAMP NOT NULL,
      etag VARCHAR
    )
  `);

  // Insert objects using prepared statement
  const stmt = await connection.prepare(`
    INSERT INTO bucket_index VALUES (?, ?, ?, ?)
  `);

  for (const obj of objects) {
    await stmt.query(
      obj.key,
      obj.size,
      obj.lastModified.toISOString(),
      obj.etag
    );
  }

  await stmt.close();

  // Store connection in the index store
  store.setConnection(bucketKey, connection);

  console.info(
    `[buildIndex] Created index for ${bucketKey} with ${objects.length} objects`
  );
}

/**
 * Build index for a bucket
 *
 * @param bucketKey - Key in format "provider/bucketName"
 * @param bucketName - S3 bucket name
 * @param credentials - AWS credentials
 * @param bucketConfig - Bucket configuration
 */
export async function buildIndex(
  bucketKey: string,
  bucketName: string,
  credentials: Credentials,
  bucketConfig: BucketConfig
): Promise<void> {
  const store = useIndexStore.getState();

  // Check if already building or ready
  if (store.isBuilding(bucketKey) || store.hasIndex(bucketKey)) {
    return;
  }

  // Set initial building state
  const initialProgress: IndexBuildProgress = {
    status: "building",
    loaded: 0,
  };
  store.setProgress(bucketKey, initialProgress);

  try {
    // Create S3 client
    const s3Client = createS3Client(credentials, bucketConfig);

    // List all objects with progress reporting
    const objects = await listAllObjects(s3Client, bucketName, (loaded) => {
      store.setProgress(bucketKey, {
        status: "building",
        loaded,
      });
    });

    // Create DuckDB index
    await createIndexDatabase(bucketKey, objects);

    // Mark as ready
    store.setReady(bucketKey, objects.length);

    console.info(`[buildIndex] Index ready for ${bucketKey}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[buildIndex] Failed to build index for ${bucketKey}:`,
      error
    );
    store.setError(bucketKey, message);
    throw error;
  }
}
