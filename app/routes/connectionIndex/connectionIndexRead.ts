import type { Connection } from "~/utils/connectionsStore/useConnectionsStore";
import { createDatabase } from "~/utils/db/createDatabase";
import { toIndexS3Key, toS3Uri } from "~/utils/resourceId";

export interface ConnectionIndexRow {
  key: string;
  size: number;
  lastModified: string | null;
  etag: string;
}

interface ConnectionIndexReadArgs {
  connection: Connection;
  /** Full S3 key prefix to filter on (key LIKE `${listPath}%`). */
  listPath: string;
  limit?: number;
}

/**
 * Read rows from the connection index whose key begins with `listPath`.
 * Runs in the browser against the parquet file via DuckDB-WASM.
 */
export async function connectionIndexRead({
  connection: { credentials, connectionConfig },
  listPath,
  limit = 1000,
}: ConnectionIndexReadArgs): Promise<ConnectionIndexRow[]> {
  const db = await createDatabase(
    connectionConfig.name,
    credentials,
    connectionConfig,
  );

  // DuckDB's read_parquet() doesn't support parameterized file paths, so the
  // URI is interpolated. Components come from server-provided ConnectionConfig;
  // the single-quote guard catches accidental SQL breakage, not injection.
  const s3Uri = toS3Uri(
    connectionConfig.bucketName,
    toIndexS3Key(connectionConfig.prefix ?? ""),
  );
  if (s3Uri.includes("'")) {
    throw new Error("Invalid S3 URI for DuckDB query: contains single quote");
  }

  const stmt = await db.prepare(/* sql */ `
    SELECT key, size, last_modified, etag
    FROM read_parquet('${s3Uri}')
    WHERE key LIKE $1
    ORDER BY key
    LIMIT $2
  `);
  const result = await stmt.query(`${listPath}%`, limit);

  return extractRows(result);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- DuckDB WASM result type is not exported
function extractRows(result: any): ConnectionIndexRow[] {
  const rows: ConnectionIndexRow[] = [];
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
