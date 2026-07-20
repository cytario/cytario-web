import { createLabel } from "~/.server/logging";
import { cytarioConfig } from "~/config";
import { type BucketCatalog, bucketCatalogSchema } from "~/utils/bucketCatalog.schema";

const label = createLabel("providers", "cyan");

const BUCKETS_LOOKUP_PATH = "/org/buckets";
const BUCKETS_LOOKUP_HEADER = "X-Providers-Lookup-Secret";
const BUCKETS_LOOKUP_TIMEOUT_MS = 10_000;

/** How long a resolved bucket catalog is served from memory before re-reading its source. */
const CATALOG_CACHE_TTL_MS = 30_000;
const CATALOG_CACHE_MAX_ENTRIES = 100;

interface CatalogCacheEntry {
  expiresAt: number;
  promise: Promise<BucketCatalog>;
}

const bucketCache = new Map<string, CatalogCacheEntry>();

/** Test hook: drop every cached bucket catalog. */
export function clearBucketCatalogCache(): void {
  bucketCache.clear();
}

/**
 * Resolves the active organization's registered-bucket catalog — the buckets a
 * storage connection may bind to, filtered to the chosen provider connection at
 * the call site.
 *
 * Present only in admin-portal builds (EE & SaaS); OSS self-hosted builds have
 * no portal and the bucket is entered as free text. When the portal source is
 * not `portal`, this function throws — callers in OSS paths never reach it.
 *
 * The lookup is advisory: on staleness or unavailability the caller degrades to
 * a clear error and never blocks an already-created connection.
 *
 * Resolved catalogs are memoized per organization with a short TTL — the
 * catalog is consulted on every connection create/update, and the portal
 * round-trip should not run per request. Failures are never cached.
 */
export async function getBucketCatalog(
  organization: string,
  accessToken?: string,
): Promise<BucketCatalog> {
  const cacheKey = `portal:${organization}`;

  const cached = bucketCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = fetchPortalBuckets(organization, accessToken).catch((error: unknown) => {
    bucketCache.delete(cacheKey);
    throw error;
  });

  if (bucketCache.size >= CATALOG_CACHE_MAX_ENTRIES) {
    const oldestKey = bucketCache.keys().next().value;
    if (oldestKey !== undefined) bucketCache.delete(oldestKey);
  }
  bucketCache.set(cacheKey, { expiresAt: Date.now() + CATALOG_CACHE_TTL_MS, promise });
  return promise;
}

async function fetchPortalBuckets(
  organization: string,
  accessToken?: string,
): Promise<BucketCatalog> {
  const { portalInternalUrl, lookupSecret } = cytarioConfig.providers;
  if (!portalInternalUrl || !lookupSecret) {
    throw new Error(
      "Bucket lookup is misconfigured: PORTAL_INTERNAL_URL and PROVIDERS_LOOKUP_SECRET are required in an admin-portal build.",
    );
  }

  const url = new URL(BUCKETS_LOOKUP_PATH, ensureTrailingSlash(portalInternalUrl));
  url.searchParams.set("org", organization);

  const headers: Record<string, string> = {
    [BUCKETS_LOOKUP_HEADER]: lookupSecret,
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(BUCKETS_LOOKUP_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`${label} Bucket lookup request failed:`, error);
    throw new Error("Bucket lookup is currently unavailable. Try again shortly.");
  }

  if (!response.ok) {
    console.error(`${label} Bucket lookup returned ${response.status}`);
    throw new Error("Bucket lookup is currently unavailable. Try again shortly.");
  }

  const raw = await response.json();
  return bucketCatalogSchema.parse(raw);
}

function ensureTrailingSlash(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

/** Look up a registered bucket by its bucket name within a catalog. */
export function findBucketByName(
  catalog: BucketCatalog,
  providerConnectionId: string,
  bucketName: string,
): BucketCatalog["buckets"][number] | undefined {
  return catalog.buckets.find(
    (b) => b.providerConnectionId === providerConnectionId && b.bucketName === bucketName,
  );
}
