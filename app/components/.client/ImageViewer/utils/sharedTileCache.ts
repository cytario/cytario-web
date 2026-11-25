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

/** Consumers of one in-flight fetch; it is aborted once all of them have given up. */
interface PendingFetch {
  controller: AbortController;
  consumers: number;
  /** A consumer without a signal can never give up, so the fetch must finish. */
  pinned: boolean;
}

const pendingFetches = new WeakMap<Promise<unknown>, PendingFetch>();

const abortError = (): DOMException => new DOMException("Tile request was aborted", "AbortError");

/**
 * Return a memoized in-flight (or resolved) promise for `key`, fetching via
 * `fetcher` on miss. Failed fetches (including aborts) are evicted so the next
 * caller refetches — keeps a panned-away panel's abort from poisoning the cache.
 *
 * A caller passing `signal` stops waiting when it aborts; the shared fetch is
 * aborted (through the signal handed to `fetcher`) only when every caller
 * waiting on it has aborted.
 */
export function getCachedTile<T>(
  namespace: object,
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError());

  const cache = cacheFor(namespace);

  let stored = cache.get(key) as Promise<T> | undefined;
  if (!stored) {
    const controller = new AbortController();
    const fetched: Promise<T> = fetcher(controller.signal).then(
      (value) => {
        pendingFetches.delete(fetched);
        resolvedSizes.set(fetched, byteLengthOf(value));
        // Re-set with the resolved size known; lru-cache re-runs
        // sizeCalculation, and entries over maxEntrySize are dropped by the
        // library itself.
        if (cache.peek(key) === fetched) cache.set(key, fetched);
        return value;
      },
      (error) => {
        pendingFetches.delete(fetched);
        if (cache.peek(key) === fetched) cache.delete(key);
        throw error;
      },
    );
    pendingFetches.set(fetched, { controller, consumers: 0, pinned: false });
    cache.set(key, fetched);
    stored = fetched;
  }

  const pending = pendingFetches.get(stored);
  if (!pending) return stored;
  if (!signal) {
    pending.pinned = true;
    return stored;
  }

  const shared = stored;
  pending.consumers += 1;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      pending.consumers -= 1;
      if (pending.consumers === 0 && !pending.pinned) {
        // Evict first so a caller arriving now starts a fresh fetch instead of
        // joining the one being aborted.
        if (cache.peek(key) === shared) cache.delete(key);
        pending.controller.abort();
      }
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    shared.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
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
