import { Credentials } from "@aws-sdk/client-sts";
import {
  getJsDelivrBundles,
  selectBundle,
  createWorker,
  AsyncDuckDB,
  ConsoleLogger,
} from "@duckdb/duckdb-wasm";

import { getUint8ArrayForResourceId } from "./getBlobFromObjectNode";
import { buildCreateTableQuery } from "./sqlQueries";
import { toS3Uri } from "../resourceId";

export async function convertCsvToParquet(
  resourceId: string,
  credentials: Credentials
) {
  console.log(`[CSV→Parquet] Starting conversion for: ${resourceId}`);

  let db: AsyncDuckDB | null = null;
  let conn: Awaited<ReturnType<AsyncDuckDB["connect"]>> | null = null;

  try {
    const JSDELIVR_BUNDLES = getJsDelivrBundles();
    const bundle = await selectBundle(JSDELIVR_BUNDLES);

    if (!bundle.mainWorker) {
      throw new Error("DuckDB WASM worker is not available");
    }

    const worker = await createWorker(bundle.mainWorker);
    db = new AsyncDuckDB(new ConsoleLogger(4), worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    conn = await db.connect();

    await conn.query(`INSTALL httpfs;`);
    await conn.query(`LOAD httpfs;`);
    await conn.query(`INSTALL spatial;`);
    await conn.query(`LOAD spatial;`);

    const csvBytes = await getUint8ArrayForResourceId(resourceId);
    await db.registerFileBuffer(resourceId, csvBytes);

    // Create table `geometries`
    const createTableSQL = buildCreateTableQuery(resourceId, "polygon");
    await conn.query(createTableSQL);

    await conn.query(`SET s3_access_key_id='${credentials.AccessKeyId}'`);

    await conn.query(
      `SET s3_secret_access_key='${credentials.SecretAccessKey}'`
    );

    if (credentials.SessionToken) {
      await conn.query(`SET s3_session_token='${credentials.SessionToken}'`);
    }
    const AWS_REGION = "eu-central-1";
    await conn.query(`SET s3_region='${AWS_REGION}'`);

    // Write to Parquet with WKB geometry
    const s3Uri = toS3Uri(resourceId);
    const parquetDestination = `${s3Uri}.parquet`;

    console.log(
      `[CSV→Parquet] Writing to S3 as Parquet (ZSTD compression, 500k row groups)...`
    );
    console.log(`[CSV→Parquet] → Destination: ${parquetDestination}`);
    console.log("[CSV→Parquet] ⏳ This may take a while for large datasets...");

    // Convert geometry to WKT (Well-Known Text) before writing to parquet
    // WKT is VARCHAR type which serializes better to Parquet than WKB BLOB
    await conn.query(/*sql*/ `
      COPY (
        SELECT
          object,
          x,
          y,
          ST_AsText(geom) as geom,
          COLUMNS('marker_positive_.*')
        FROM geometries
      )
      TO '${parquetDestination}'
      (FORMAT PARQUET, COMPRESSION ZSTD);
    `);

    return true;
  } catch (error) {
    console.error("[CSV→Parquet] ✗ Error during conversion:", error);
    throw error;
  } finally {
    // Clean up resources
    if (conn) {
      await conn.close();
      console.log("[CSV→Parquet] ✓ Database connection closed");
    }
    if (db) {
      await db.terminate();
      console.log("[CSV→Parquet] ✓ DuckDB worker terminated");
    }
  }
}
