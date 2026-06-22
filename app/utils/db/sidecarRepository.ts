import { createDatabase } from "./createDatabase";
import { escapeSqlString } from "./escapeSqlString";
import { resolveResourceId } from "../connectionsStore/selectors";
import { getSidecarKey, type SidecarKind } from "../sidecarKey";

const sidecarFilesQuery = /*sql*/ `SELECT file FROM glob(?)`;
const readTextQuery = /*sql*/ `SELECT content FROM read_text(?)`;

/**
 * Transport for a single user's sidecar files (annotations, settings, …) in the
 * customer's S3 bucket, via duckdb-wasm. Owns key derivation, existence, and
 * read/write of the JSON document — but not its shape: each `kind` layers its
 * own envelope/parsing on top (see `getAnnotationsWasm` / `writeAnnotations`).
 *
 * Single-writer per key: one user owns one file per kind, so `write` is a
 * full-file overwrite. Scoped to one image (`resourceId`) and one owner
 * (`userId`) — the multi-user read union is a separate concern.
 */
export class SidecarRepository {
  constructor(
    private readonly resourceId: string,
    private readonly userId: string,
  ) {}

  private async target(kind: SidecarKind) {
    const { credentials, connectionConfig, s3Uri } = resolveResourceId(this.resourceId);
    const connection = await createDatabase(this.resourceId, credentials, connectionConfig);
    const key = getSidecarKey(s3Uri, kind, this.userId);
    return { connection, key, s3Uri };
  }

  /** Whether the sidecar exists on S3 (ListObjects via `glob`, 0 rows = absent). */
  async exists(kind: SidecarKind): Promise<boolean> {
    const { connection, key } = await this.target(kind);
    const statement = await connection.prepare(sidecarFilesQuery);
    try {
      return (await statement.query(key)).numRows > 0;
    } finally {
      await statement.close();
    }
  }

  /**
   * Parse the sidecar JSON document, or `null` when it doesn't exist. Existence
   * is resolved by `glob` first, so a missing file is `null` — never a thrown
   * read error mistaken for absence (connectivity/permission errors propagate).
   */
  async read<T>(kind: SidecarKind): Promise<T | null> {
    if (!(await this.exists(kind))) return null;
    const { connection, key } = await this.target(kind);
    const statement = await connection.prepare(readTextQuery);
    try {
      const row = (await statement.query(key)).toArray()[0] as { content?: string } | undefined;
      return row?.content ? (JSON.parse(row.content) as T) : null;
    } finally {
      await statement.close();
    }
  }

  /**
   * Overwrite the sidecar with `document` as the JSON file root. Each top-level
   * key becomes a `COPY … (FORMAT JSON)` column, which serializes to one bare
   * object. The `COPY TO` target and inlined values can't be bound parameters,
   * so they're escaped.
   */
  async write(kind: SidecarKind, document: Record<string, unknown>): Promise<void> {
    const { connection, key } = await this.target(kind);
    const dest = escapeSqlString(key);
    const columns = Object.entries(document)
      .map(
        ([name, value]) =>
          `json('${escapeSqlString(JSON.stringify(value))}') AS "${name.replace(/"/g, '""')}"`,
      )
      .join(", ");
    await connection.query(/*sql*/ `COPY (SELECT ${columns}) TO '${dest}' (FORMAT JSON);`);
  }
}
