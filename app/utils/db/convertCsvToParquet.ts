import { selectBundle, createWorker, AsyncDuckDB, ConsoleLogger } from "@duckdb/duckdb-wasm";

import { getLocalDuckDbBundles } from "./duckdbBundles";
import { escapeSqlString } from "./escapeSqlString";
import { getUint8ArrayForResourceId } from "./getBlobFromObjectNode";
import { buildCreateTableQuery } from "./sqlQueries";
import { resolveResourceId } from "../connectionsStore/selectors";

export async function convertCsvToParquet(resourceId: string) {
  console.log(`[CSV→Parquet] Starting conversion for: ${resourceId}`);

  let db: AsyncDuckDB | null = null;
  let conn: Awaited<ReturnType<AsyncDuckDB["connect"]>> | null = null;

  try {
    const bundle = await selectBundle(getLocalDuckDbBundles());

    if (!bundle.mainWorker) {
      throw new Error("DuckDB WASM worker is not available");
    }

    const worker = await createWorker(bundle.mainWorker);
    db = new AsyncDuckDB(new ConsoleLogger(4), worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    // See `createDatabase.ts` for the unsigned-extensions rationale.
    await db.open({ allowUnsignedExtensions: true });

    conn = await db.connect();

    // Pin the extension loader at the cytario origin (see `createDatabase.ts`).
    if (typeof window !== "undefined") {
      const repo = `${window.location.origin}/duckdb-extensions`;
      await conn.query(`SET custom_extension_repository='${repo}'`);
    }

    await conn.query(`INSTALL httpfs;`);
    await conn.query(`LOAD httpfs;`);
    await conn.query(`INSTALL spatial;`);
    await conn.query(`LOAD spatial;`);

    const csvBytes = await getUint8ArrayForResourceId(resourceId);
    await db.registerFileBuffer(resourceId, csvBytes);

    const createTableSQL = buildCreateTableQuery(resourceId, "polygon");
    await conn.query(createTableSQL);

    const { credentials, connectionConfig, s3Uri } = resolveResourceId(resourceId);

    // Single-quote-escape every interpolated value — credentials, region,
    // and S3 keys can carry `'` on non-AWS providers.
    await conn.query(`SET s3_access_key_id='${escapeSqlString(credentials.AccessKeyId ?? "")}'`);
    await conn.query(
      `SET s3_secret_access_key='${escapeSqlString(credentials.SecretAccessKey ?? "")}'`,
    );
    if (credentials.SessionToken) {
      await conn.query(`SET s3_session_token='${escapeSqlString(credentials.SessionToken)}'`);
    }
    await conn.query(
      `SET s3_region='${escapeSqlString(connectionConfig.region ?? "eu-central-1")}'`,
    );

    const parquetDestination = `${s3Uri}.parquet`;
    const escapedParquetDestination = escapeSqlString(parquetDestination);

    console.log(`[CSV→Parquet] Writing to S3 as Parquet (ZSTD compression, 500k row groups)...`);
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
      TO '${escapedParquetDestination}'
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
