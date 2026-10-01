import { LRUCache } from "lru-cache";

/**
 * Process-wide tile cache shared across ImagePanels: each panel renders its own
 * DeckGL instance, so deck.gl's per-layer Tileset2D cache is isolated per canvas —
 * this cache sits below deck.gl and memoizes the underlying fetch so a second
 * panel resolves from memory instead of the network. Keyed by a namespace object
 * (WeakMap) so entries are dropped when the loader is replaced. Bounded in BYTES,
 * not entry count: decoded tiles vary from KB to tens of MB.
 */

/** Shared byte budget for all namespaces (~512 MB of resolved tile data). */
const MAX_TOTAL_CACHE_BYTES = 512 * 1024 * 1024;
/** One entry larger than this is not worth displacing the rest of the cache. */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
/** Estimated footprint of a pending (unresolved) fetch — the compressed tile. */
const PENDING_ENTRY_BYTES = 512 * 1024;

type Cache = LRUCache<string, Promise<unknown>>;

const caches = new WeakMap<object, Cache>();

/** Real byte footprint of a resolved entry, keyed by its (stored) promise. */
const resolvedSizes = new WeakMap<Promise<unknown>, number>();

/**
 * Decoded channel tiles are `{ data: TypedArray, ... }` (plugin-api `RasterData`);
 * interleaved or multi-buffer payloads carry an array of views. Unknown shapes
 * (overlay Arrow tables, plugin-specific extensions) fall back to the pending
 * estimate so they are never counted as zero.
 */
const byteLengthOf = (value: unknown): number => {
  if (ArrayBuffer.isView(value)) return (value as ArrayBufferView).byteLength;
  if (value && typeof value === "object") {
    const { data } = value as { data?: unknown };
    if (ArrayBuffer.isView(data)) return data.byteLength;
    if (Array.isArray(data)) {
      let sum = 0;
      for (const item of data) {
        if (ArrayBuffer.isView(item)) sum += item.byteLength;
      }
      if (sum > 0) return sum;
    }
  }
  return PENDING_ENTRY_BYTES;
};

/** Stable namespace for overlay (DuckDB) tile queries — keyed by resourceId in the cache key. */
export const OVERLAY_CACHE_NS: object = {};

function cacheFor(namespace: object): Cache {
  let cache = caches.get(namespace);
  if (!cache) {
    cache = new LRUCache<string, Promise<unknown>>({
      maxSize: MAX_TOTAL_CACHE_BYTES,
      maxEntrySize: MAX_ENTRY_BYTES,
      // Entries are stored as promises, so their size is unknowable at set()
      // time — pending fetches use the compressed-bytes estimate. Once a
      // promise resolves, `getCachedTile` records the real decoded size and
      // re-sets the entry so the cache re-runs this calculation.
      sizeCalculation: (value) => resolvedSizes.get(value) ?? PENDING_ENTRY_BYTES,
    });
    caches.set(namespace, cache);
  }
  return cache;
}

/**
 * Return a memoized in-flight (or resolved) promise for `key`, fetching via
 * `fetcher` on miss. Failed fetches (including aborts) are evicted so the next
 * caller refetches — keeps a panned-away panel's abort from poisoning the cache.
 */
export function getCachedTile<T>(
  namespace: object,
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cache = cacheFor(namespace);

  const existing = cache.get(key);
  if (existing) return existing as Promise<T>;

  const stored = fetcher().then(
    (value) => {
      resolvedSizes.set(stored, byteLengthOf(value));
      // Re-set with the resolved size known; lru-cache re-runs
      // sizeCalculation, and entries over maxEntrySize are dropped by the
      // library itself.
      cache.set(key, stored);
      return value;
    },
    (error) => {
      cache.delete(key);
      throw error;
    },
  );

  cache.set(key, stored);

  return stored;
}

/** Drop all cached entries across every namespace (memory-pressure reaction). */
export function trimSharedTileCaches(): void {
  for (const ns of [OVERLAY_CACHE_NS]) {
    caches.get(ns)?.clear();
  }
}

/**
 * Drop overlay tile entries for one resource (or all when omitted) — used when
 * an overlay's column mapping changes so tiles are re-queried instead of
 * served from the stale cache.
 */
export function invalidateOverlayTiles(resourceId?: string): void {
  const cache = caches.get(OVERLAY_CACHE_NS);
  if (!cache) return;
  if (!resourceId) {
    cache.clear();
    return;
  }
  const prefix = `${resourceId}|`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
