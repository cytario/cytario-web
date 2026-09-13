import { LRUCache } from "lru-cache";

/**
 * Process-wide tile cache shared across ImagePanels (canvas view panels).
 *
 * Each ImagePanel renders its own DeckGL instance, so deck.gl's per-layer
 * Tileset2D cache is isolated per canvas — enabling split view forces the 2nd
 * panel to refetch/redecode every tile from scratch. This cache sits *below*
 * deck.gl: it memoizes the underlying fetch (channel getTile / overlay query)
 * by tile key so a second panel resolves from memory instead of the network.
 *
 * Keyed by a namespace object (the shared loader array for channels, a module
 * sentinel for overlays) via WeakMap, so entries are dropped when the loader is
 * replaced (image switch) and never collide across images.
 *
 * Bounded in BYTES, not entry count: decoded tiles and overlay Arrow tables
 * vary from KB to tens of MB, so a count cap lets memory grow unbounded.
 */

/** Shared byte budget for all namespaces (~512 MB of resolved tile data). */
const MAX_TOTAL_CACHE_BYTES = 512 * 1024 * 1024;
/** One entry larger than this is not worth displacing the rest of the cache. */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
/** Estimated footprint of a pending (unresolved) fetch — the compressed tile. */
const PENDING_ENTRY_BYTES = 512 * 1024;

type Cache = LRUCache<string, Promise<unknown>>;

const caches = new WeakMap<object, Cache>();

/** Stable namespace for overlay (DuckDB) tile queries — keyed by resourceId in the cache key. */
export const OVERLAY_CACHE_NS: object = {};

function cacheFor(namespace: object): Cache {
  let cache = caches.get(namespace);
  if (!cache) {
    cache = new LRUCache<string, Promise<unknown>>({
      maxSize: MAX_TOTAL_CACHE_BYTES,
      maxEntrySize: MAX_ENTRY_BYTES,
      // Resolved tiles carry decoded pixel data (large); pending promises only
      // pin the compressed bytes until they settle. sizeCalculation runs on the
      // stored value at set() time — the promise itself — so pending entries
      // use the estimate and re-sizing happens on replacement.
      sizeCalculation: () => PENDING_ENTRY_BYTES,
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

  const promise = fetcher().catch((error) => {
    cache.delete(key);
    throw error;
  });

  cache.set(key, promise);

  return promise;
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
