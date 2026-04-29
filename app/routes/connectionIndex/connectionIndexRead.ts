import type { _Object } from "@aws-sdk/client-s3";

import type { Connection } from "~/utils/connectionsStore/useConnectionsStore";
import { createDatabase } from "~/utils/db/createDatabase";
import { toIndexS3Key, toS3Uri } from "~/utils/resourceId";

/**
 * The thin AWS-SDK `_Object` projection we materialize from the parquet:
 * just the four fields the index stores. Picked from `_Object` so consumers
 * (e.g. `buildDirectoryTree`) can take rows directly without remapping.
 */
export type ConnectionIndexRow = Pick<
  _Object,
  "Key" | "Size" | "LastModified" | "ETag"
>;

interface ConnectionIndexReadArgs {
  connection: Connection;
  prefix: string;
  limit?: number;
}

/**
 * Thrown when the parquet index doesn't exist on S3. Callers (typically the
 * objects route) catch this and redirect the user to the index-build page.
 */
export class IndexNotFoundError extends Error {
  constructor(public readonly s3Uri: string) {
    super(`Connection index not found at ${s3Uri}`);
    this.name = "IndexNotFoundError";
  }
}

/**
 * Read rows from the connection index whose Key begins with `prefix`.
 * Runs in the browser against the parquet file via DuckDB-WASM.
 *
 * Throws `IndexNotFoundError` when the parquet file is missing — DuckDB's
 * httpfs surfaces a 404 in the error message, which we translate so the
 * caller can redirect rather than treat the missing index as a generic
 * failure.
 */
export async function connectionIndexRead({
  connection: { credentials, connectionConfig },
  prefix,
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

  try {
    // Project the snake_case parquet columns to the AWS-SDK `_Object` shape
    // so consumers receive rows in the same shape they'd get from S3 directly.
    const stmt = await db.prepare(/* sql */ `
      SELECT
        key AS "Key",
        size AS "Size",
        last_modified AS "LastModified",
        etag AS "ETag"
      FROM read_parquet('${s3Uri}')
      WHERE key LIKE $1
      ORDER BY key
      LIMIT $2
    `);
    const result = await stmt.query(`${prefix}%`, limit);

    return extractRows(result);
  } catch (err) {
    if (isHttpNotFound(err)) {
      throw new IndexNotFoundError(s3Uri);
    }
    throw err;
  }
}

/**
 * httpfs surfaces a 404 as e.g. `IO Error: HTTP GET error on '<url>': HTTP 404`.
 * The message is the only reliable signal — DuckDB-WASM doesn't expose a
 * structured error code for HTTP failures.
 */
function isHttpNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /HTTP 404|404 Not Found/i.test(err.message);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- DuckDB WASM result type is not exported
function extractRows(result: any): ConnectionIndexRow[] {
  const rows: ConnectionIndexRow[] = [];
  for (let i = 0; i < result.numRows; i++) {
    const row = result.get(i);
    if (!row) continue;
    const json = row.toJSON();
    rows.push({
      Key: String(json.Key),
      Size: Number(json.Size),
      LastModified:
        json.LastModified != null ? new Date(String(json.LastModified)) : undefined,
      ETag: String(json.ETag),
    });
  }
  return rows;
}
