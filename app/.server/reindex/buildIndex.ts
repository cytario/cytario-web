import { _Object } from "@aws-sdk/client-s3";
import { DuckDBInstance } from "@duckdb/node-api";
import { randomUUID } from "crypto";
import { readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Builds a Parquet index file from a list of S3 objects using DuckDB.
 * Schema: key (VARCHAR), size (BIGINT), last_modified (TIMESTAMP), etag (VARCHAR)
 *
 * Uses DuckDB's native Node API to create a Parquet file with ZSTD compression,
 * then returns the result as a Buffer for upload to S3.
 */
export async function buildIndexParquet(objects: _Object[]): Promise<Buffer> {
  const id = randomUUID();
  const parquetPath = join(tmpdir(), `cytario-${id}.parquet`);

  // Temp paths use randomUUID() and are not user-controlled, but assert for defense-in-depth.
  if (parquetPath.includes("'")) {
    throw new Error(
      "Temp file path contains single quote — cannot safely interpolate into SQL",
    );
  }

  try {
    const instance = await DuckDBInstance.create();
    const connection = await instance.connect();

    await connection.run(`
      CREATE TABLE objects (
        key VARCHAR,
        size BIGINT,
        last_modified TIMESTAMP,
        etag VARCHAR
      )
    `);

    if (objects.length > 0) {
      const jsonPath = join(tmpdir(), `cytario-${id}.json`);

      if (jsonPath.includes("'")) {
        throw new Error(
          "Temp file path contains single quote — cannot safely interpolate into SQL",
        );
      }

      try {
        const jsonData = objects.map((obj) => ({
          key: obj.Key ?? "",
          size: obj.Size ?? 0,
          last_modified: obj.LastModified?.toISOString() ?? null,
          etag: (obj.ETag ?? "").replace(/"/g, ""),
        }));

        await writeFile(jsonPath, JSON.stringify(jsonData));

        await connection.run(
          `INSERT INTO objects SELECT * FROM read_json_auto('${jsonPath}')`,
        );
      } finally {
        await unlink(jsonPath).catch(() => {});
      }
    }

    await connection.run(
      `COPY (SELECT * FROM objects ORDER BY key) TO '${parquetPath}' (FORMAT PARQUET, COMPRESSION ZSTD)`,
    );

    return await readFile(parquetPath);
  } finally {
    await unlink(parquetPath).catch(() => {});
  }
}
