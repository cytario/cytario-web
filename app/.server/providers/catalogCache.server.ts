import { cytarioConfig } from "~/config";

/**
 * Burst window: a successful catalog lookup is shared by concurrent requests
 * for this long before the next call re-reads its source. Short by design —
 * nothing user-observable may go stale, and catalog changes must become
 * visible within seconds.
 */
export const CATALOG_BURST_WINDOW_MS = 2_000;

const CATALOG_CACHE_MAX_ENTRIES = 100;

interface CatalogCacheEntry<T> {
  success?: { value: T; expiresAt: number };
  failure?: { error: unknown; expiresAt: number };
  inflight?: Promise<T>;
}

export interface CatalogCache<T> {
  get(organization: string, accessToken?: string): Promise<T>;
  clear(): void;
}

/**
 * Fail-closed fetch-through cache for whole-org catalogs: always refetches on
 * demand, coalesces concurrent callers onto one in-flight promise, serves a
 * successful result only within the burst window, and memoizes failures for
 * `providers.catalogFailureBackoffMs` so an outage fails fast instead of
 * round-tripping the portal per request. Expired results are never reused.
 */
export function createCatalogCache<T>(
  fetchCatalog: (organization: string, accessToken?: string) => Promise<T>,
  buildCacheKey: (organization: string) => string,
): CatalogCache<T> {
  const cache = new Map<string, CatalogCacheEntry<T>>();

  function evictOldestIfFull(): void {
    if (cache.size >= CATALOG_CACHE_MAX_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
  }

  async function get(organization: string, accessToken?: string): Promise<T> {
    const cacheKey = buildCacheKey(organization);
    const now = Date.now();

    const cached = cache.get(cacheKey);
    if (cached) {
      if (cached.success && cached.success.expiresAt > now) return cached.success.value;
      if (cached.inflight) return cached.inflight;
      if (cached.failure && cached.failure.expiresAt > now) throw cached.failure.error;
      cache.delete(cacheKey);
    }

    const entry: CatalogCacheEntry<T> = {};
    const promise = fetchCatalog(organization, accessToken).then(
      (value) => {
        entry.success = { value, expiresAt: Date.now() + CATALOG_BURST_WINDOW_MS };
        entry.inflight = undefined;
        return value;
      },
      (error: unknown) => {
        entry.failure = {
          error,
          expiresAt: Date.now() + cytarioConfig.providers.catalogFailureBackoffMs,
        };
        entry.inflight = undefined;
        throw error;
      },
    );
    entry.inflight = promise;

    evictOldestIfFull();
    cache.set(cacheKey, entry);
    return promise;
  }

  function clear(): void {
    cache.clear();
  }

  return { get, clear };
}
