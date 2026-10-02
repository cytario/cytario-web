import { createDatabase, releaseDatabase } from "./createDatabase";
import { escapeSqlString } from "./escapeSqlString";
import { resolveResourceId } from "../connectionsStore/selectors";
import { constructS3Url, s3KeyFromUri } from "../resourceId";
import { getSidecarKey, parseOwnerFromKey, type SidecarKind } from "../sidecarKey";
import type { SignedFetch } from "../signedFetch";

const sidecarFilesQuery = /*sql*/ `SELECT file FROM glob(?)`;
const readTextQuery = /*sql*/ `SELECT content FROM read_text(?)`;

/**
 * Transport for sidecar files (annotations, settings, …) in the customer's S3
 * bucket, via duckdb-wasm. Owns key derivation and read/write of the JSON
 * document, but not its shape: each `kind` layers its own envelope/parsing on
 * top. `owner` is generic (set id for annotations, user id for settings) and
 * treated as an opaque key segment. Single-writer per key: one owner owns one
 * file per kind, so `write` is a full-file overwrite; the all-owners read
 * union is the static `readAll`.
 */
export class SidecarRepository {
  constructor(
    private readonly resourceId: string,
    private readonly owner: string,
  ) {}

  /**
   * Every owner's sidecar of `kind`, read per-file so one unreadable file
   * doesn't fail the rest. Settings go through the signed fetch — duckdb's
   * S3 reads carry no cache policy, so the browser would serve a stale
   * cached body after a mid-session overwrite. Annotations stay on duckdb
   * (large GeoJSON must not move through the JS heap), so their GETs must
   * carry no response-cache-control param.
   */
  static async readAll<T>(
    resourceId: string,
    kind: SidecarKind,
    signedFetch?: SignedFetch,
  ): Promise<Record<string, T>> {
    if (kind === "settings" && typeof signedFetch !== "function") {
      throw new Error("settings sidecar reads require a signed fetch (cache-poisoned transport)");
    }
    const { credentials, region, endpoint, s3Uri, connectionConfig } =
      resolveResourceId(resourceId);
    const connection = await createDatabase(resourceId, credentials, { region, endpoint });
    const glob = getSidecarKey(s3Uri, kind); // omit owner ⇒ `*` wildcard over all owners

    try {
      const globStatement = await connection.prepare(sidecarFilesQuery);
      let files: string[];
      try {
        files = ((await globStatement.query(glob)).toArray() as { file: string }[]).map(
          (row) => row.file,
        );
      } finally {
        await globStatement.close();
      }
      if (files.length === 0) return {};

      const httpsUrlFor = (filename: string) =>
        constructS3Url(
          { bucketName: connectionConfig.bucketName, region, endpoint },
          s3KeyFromUri(filename),
        );

      const byOwner: Record<string, T> = {};
      for (const filename of files) {
        const owner = parseOwnerFromKey(filename, kind);
        if (!owner) continue;
        const content =
          kind === "settings"
            ? await SidecarRepository.readViaSignedFetch<T>(filename, signedFetch!, httpsUrlFor)
            : await SidecarRepository.readViaDuckdb<T>(connection, filename);
        if (content !== undefined) byOwner[owner] = content;
      }
      return byOwner;
    } finally {
      releaseDatabase(resourceId);
    }
  }

  /** One settings file via the signed fetch (revalidating cache policy). */
  private static async readViaSignedFetch<T>(
    filename: string,
    signedFetch: SignedFetch,
    httpsUrlFor: (filename: string) => string,
  ): Promise<T | undefined> {
    try {
      const response = await signedFetch(httpsUrlFor(filename));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return JSON.parse(await response.text()) as T;
    } catch (error) {
      console.error(`[sidecar] skipping unreadable ${filename}:`, error);
      return undefined;
    }
  }

  private static async readViaDuckdb<T>(
    connection: Awaited<ReturnType<typeof createDatabase>>,
    filename: string,
  ): Promise<T | undefined> {
    try {
      const statement = await connection.prepare(readTextQuery);
      try {
        const content = (
          (await statement.query(filename)).toArray() as {
            content: string;
          }[]
        )[0]?.content;
        return content ? (JSON.parse(content) as T) : undefined;
      } finally {
        await statement.close();
      }
    } catch (error) {
      console.error(`[sidecar] skipping unreadable ${filename}:`, error);
      return undefined;
    }
  }

  private async target(kind: SidecarKind) {
    const { credentials, region, endpoint, s3Uri } = resolveResourceId(this.resourceId);
    const connection = await createDatabase(this.resourceId, credentials, { region, endpoint });
    const key = getSidecarKey(s3Uri, kind, this.owner);
    return { connection, key, s3Uri };
  }

  /**
   * Each top-level key becomes a `COPY … (FORMAT JSON)` column, which
   * serializes to one bare object. The `COPY TO` target and inlined values
   * can't be bound parameters, so they're escaped.
   */
  async write(kind: SidecarKind, document: Record<string, unknown>): Promise<void> {
    const { connection, key } = await this.target(kind);
    try {
      const dest = escapeSqlString(key);
      const columns = Object.entries(document)
        .map(
          ([name, value]) =>
            `json('${escapeSqlString(JSON.stringify(value))}') AS "${name.replace(/"/g, '""')}"`,
        )
        .join(", ");
      await connection.query(/*sql*/ `COPY (SELECT ${columns}) TO '${dest}' (FORMAT JSON);`);
    } finally {
      releaseDatabase(this.resourceId);
    }
  }
}
