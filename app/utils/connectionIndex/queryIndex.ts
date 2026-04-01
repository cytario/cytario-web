import { Credentials } from "@aws-sdk/client-sts";

import type { ConnectionConfig } from "~/.generated/client";
import { createDatabase } from "~/utils/db/createDatabase";
import { toIndexS3Key } from "~/utils/resourceId";

export interface IndexSearchResult {
  key: string;
  size: number;
  lastModified: string | null;
  etag: string;
}

/**
 * Build a validated S3 URI for use in DuckDB's read_parquet().
 *
 * DuckDB's read_parquet() does not support parameterized file paths, so the URI
 * must be interpolated into the SQL string. The URI components come from
 * server-provided ConnectionConfig, not user input. We assert no single quotes
 * to prevent accidental SQL breakage.
 */
function buildParquetUri(bucketName: string, prefix: string): string {
  const s3Uri = `s3://${bucketName}/${toIndexS3Key(prefix)}`;
  if (s3Uri.includes("'")) {
    throw new Error("Invalid S3 URI for DuckDB query: contains single quote");
  }
  return s3Uri;
}

/**
 * Search the connection index for keys matching a query string (case-insensitive).
 *
 * The actual user-provided search terms are passed via `$1`/`$2` parameterized
 * query parameters, so only the file path (validated by buildParquetUri) is interpolated.
 */
export async function searchIndex(
  query: string,
  connectionKey: string,
  bucketName: string,
  prefix: string,
  credentials: Credentials,
  connectionConfig: ConnectionConfig,
  limit = 50,
): Promise<IndexSearchResult[]> {
  const connection = await createDatabase(
    connectionKey,
    credentials,
    connectionConfig,
  );
  const s3Uri = buildParquetUri(bucketName, prefix);

  const stmt = await connection.prepare(`
    SELECT key, size, last_modified, etag
    FROM read_parquet('${s3Uri}')
    WHERE key ILIKE $1
    ORDER BY key
    LIMIT $2
  `);
  const result = await stmt.query(`%${query}%`, limit);

  return extractRows(result);
}

/**
 * List objects under a path prefix from the connection index.
 */
export async function listPrefix(
  connectionKey: string,
  bucketName: string,
  indexPrefix: string,
  listPath: string,
  credentials: Credentials,
  connectionConfig: ConnectionConfig,
  limit = 1000,
): Promise<IndexSearchResult[]> {
  const connection = await createDatabase(
    connectionKey,
    credentials,
    connectionConfig,
  );
  const s3Uri = buildParquetUri(bucketName, indexPrefix);

  const stmt = await connection.prepare(`
    SELECT key, size, last_modified, etag
    FROM read_parquet('${s3Uri}')
    WHERE key LIKE $1
    ORDER BY key
    LIMIT $2
  `);
  const result = await stmt.query(`${listPath}%`, limit);

  return extractRows(result);
}

/**
 * Get total object count from the connection index.
 */
export async function getIndexCount(
  connectionKey: string,
  bucketName: string,
  prefix: string,
  credentials: Credentials,
  connectionConfig: ConnectionConfig,
): Promise<number> {
  const connection = await createDatabase(
    connectionKey,
    credentials,
    connectionConfig,
  );
  const s3Uri = buildParquetUri(bucketName, prefix);

  const result = await connection.query(
    `SELECT COUNT(*) as count FROM read_parquet('${s3Uri}')`,
  );

  const row = result.get(0);
  return row ? Number(row.count) : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- DuckDB WASM result type is not exported
function extractRows(result: any): IndexSearchResult[] {
  const rows: IndexSearchResult[] = [];
  for (let i = 0; i < result.numRows; i++) {
    const row = result.get(i);
    if (row) {
      const json = row.toJSON();
      rows.push({
        key: String(json.key),
        size: Number(json.size),
        lastModified: json.last_modified ? String(json.last_modified) : null,
        etag: String(json.etag),
      });
    }
  }
  return rows;
}
