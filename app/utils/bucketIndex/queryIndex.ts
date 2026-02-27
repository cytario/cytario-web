import { Credentials } from "@aws-sdk/client-sts";

import { BucketConfig } from "~/.generated/client";
import { createDatabase } from "~/utils/db/createDatabase";
import { toIndexS3Key } from "~/utils/resourceId";

export interface IndexSearchResult {
  key: string;
  size: number;
  lastModified: string | null;
  etag: string;
}

/**
 * Search the bucket index for keys matching a query string (case-insensitive).
 */
export async function searchIndex(
  query: string,
  connectionKey: string,
  bucketName: string,
  prefix: string,
  credentials: Credentials,
  bucketConfig: BucketConfig,
  limit = 50,
): Promise<IndexSearchResult[]> {
  const connection = await createDatabase(
    connectionKey,
    credentials,
    bucketConfig,
  );
  const s3Uri = `s3://${bucketName}/${toIndexS3Key(prefix)}`;

  const escapedQuery = query.replace(/'/g, "''");

  const result = await connection.query(`
    SELECT key, size, last_modified, etag
    FROM read_parquet('${s3Uri}')
    WHERE key ILIKE '%${escapedQuery}%'
    ORDER BY key
    LIMIT ${limit}
  `);

  return extractRows(result);
}

/**
 * List objects under a path prefix from the bucket index.
 */
export async function listPrefix(
  connectionKey: string,
  bucketName: string,
  indexPrefix: string,
  listPath: string,
  credentials: Credentials,
  bucketConfig: BucketConfig,
  limit = 1000,
): Promise<IndexSearchResult[]> {
  const connection = await createDatabase(
    connectionKey,
    credentials,
    bucketConfig,
  );
  const s3Uri = `s3://${bucketName}/${toIndexS3Key(indexPrefix)}`;

  const escapedPath = listPath.replace(/'/g, "''");

  const result = await connection.query(`
    SELECT key, size, last_modified, etag
    FROM read_parquet('${s3Uri}')
    WHERE key LIKE '${escapedPath}%'
    ORDER BY key
    LIMIT ${limit}
  `);

  return extractRows(result);
}

/**
 * Get total object count from the bucket index.
 */
export async function getIndexCount(
  connectionKey: string,
  bucketName: string,
  prefix: string,
  credentials: Credentials,
  bucketConfig: BucketConfig,
): Promise<number> {
  const connection = await createDatabase(
    connectionKey,
    credentials,
    bucketConfig,
  );
  const s3Uri = `s3://${bucketName}/${toIndexS3Key(prefix)}`;

  const result = await connection.query(
    `SELECT COUNT(*) as count FROM read_parquet('${s3Uri}')`,
  );

  const row = result.get(0);
  return row ? Number(row.count) : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
