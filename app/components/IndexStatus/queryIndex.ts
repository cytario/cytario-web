import { useIndexStore } from "./useIndexStore";

export interface IndexEntry {
  key: string;
  size: number;
  lastModified: Date;
  etag: string | null;
}

export interface SearchResult {
  bucketKey: string;
  entries: IndexEntry[];
}

/**
 * Search for objects across multiple indexed buckets
 *
 * @param query - Search query (matches against object keys)
 * @param bucketKeys - Array of bucket keys to search (format: "provider/bucketName")
 * @param limit - Maximum results per bucket (default: 50)
 */
export async function searchIndex(
  query: string,
  bucketKeys: string[],
  limit = 50
): Promise<SearchResult[]> {
  const store = useIndexStore.getState();
  const results: SearchResult[] = [];

  if (!query.trim()) {
    return results;
  }

  const searchPattern = `%${query.toLowerCase()}%`;

  for (const bucketKey of bucketKeys) {
    const indexState = store.getIndex(bucketKey);
    if (!indexState?.connection || indexState.status !== "ready") {
      continue;
    }

    try {
      const stmt = await indexState.connection.prepare(/*sql*/ `
        SELECT key, size, last_modified, etag
        FROM bucket_index
        WHERE LOWER(key) LIKE ?
        ORDER BY key
        LIMIT ?
      `);
      const result = await stmt.query(searchPattern, limit);
      await stmt.close();

      const entries: IndexEntry[] = [];
      for (let i = 0; i < result.numRows; i++) {
        const row = result.get(i);
        if (row) {
          entries.push({
            key: row.key as string,
            size: Number(row.size),
            lastModified: new Date(row.last_modified as string),
            etag: row.etag as string | null,
          });
        }
      }

      if (entries.length > 0) {
        results.push({ bucketKey, entries });
      }
    } catch (error) {
      console.error(`[queryIndex] Search failed for ${bucketKey}:`, error);
    }
  }

  return results;
}

/**
 * List objects at a specific prefix from an indexed bucket
 *
 * @param bucketKey - Bucket key (format: "provider/bucketName")
 * @param prefix - S3 prefix to list (e.g., "path/to/folder/")
 * @param limit - Maximum results (default: 1000)
 */
export async function listPrefix(
  bucketKey: string,
  prefix: string,
  limit = 1000
): Promise<IndexEntry[]> {
  const store = useIndexStore.getState();
  const indexState = store.getIndex(bucketKey);

  if (!indexState?.connection || indexState.status !== "ready") {
    return [];
  }

  try {
    const prefixPattern = `${prefix}%`;

    const stmt = await indexState.connection.prepare(/*sql*/ `
      SELECT key, size, last_modified, etag
      FROM bucket_index
      WHERE key LIKE ?
      ORDER BY key
      LIMIT ?
    `);
    const result = await stmt.query(prefixPattern, limit);
    await stmt.close();

    const entries: IndexEntry[] = [];
    for (let i = 0; i < result.numRows; i++) {
      const row = result.get(i);
      if (row) {
        entries.push({
          key: row.key as string,
          size: Number(row.size),
          lastModified: new Date(row.last_modified as string),
          etag: row.etag as string | null,
        });
      }
    }

    return entries;
  } catch (error) {
    console.error(`[queryIndex] List prefix failed for ${bucketKey}:`, error);
    return [];
  }
}

/**
 * Get total object count from an indexed bucket
 */
export async function getIndexCount(bucketKey: string): Promise<number> {
  const store = useIndexStore.getState();
  const indexState = store.getIndex(bucketKey);

  if (!indexState?.connection || indexState.status !== "ready") {
    return 0;
  }

  try {
    const result = await indexState.connection.query(/*sql*/ `
      SELECT COUNT(*) as count FROM bucket_index
    `);

    const row = result.get(0);
    return row ? Number(row.count) : 0;
  } catch (error) {
    console.error(`[queryIndex] Get count failed for ${bucketKey}:`, error);
    return 0;
  }
}

/**
 * Get all indexed bucket keys that are ready
 */
export function getIndexedBuckets(): string[] {
  const store = useIndexStore.getState();
  return Object.entries(store.indexes)
    .filter(([, state]) => state.status === "ready")
    .map(([key]) => key);
}

