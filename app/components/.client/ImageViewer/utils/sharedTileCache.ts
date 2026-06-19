import { LRUCache } from "lru-cache";

/**
 * Process-wide tile cache shared across ImagePanels.
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
 */

const MAX_ENTRIES_PER_NAMESPACE = 2000;

type Cache = LRUCache<string, Promise<unknown>>;

const caches = new WeakMap<object, Cache>();

/** Stable namespace for overlay (DuckDB) tile queries — keyed by resourceId in the cache key. */
export const OVERLAY_CACHE_NS: object = {};

function cacheFor(namespace: object): Cache {
  let cache = caches.get(namespace);
  if (!cache) {
    cache = new LRUCache<string, Promise<unknown>>({ max: MAX_ENTRIES_PER_NAMESPACE });
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
