import { createLabel } from "~/.server/logging";
import { createCatalogCache } from "~/.server/providers/catalogCache.server";
import { cytarioConfig } from "~/config";
import { type BucketCatalog, bucketCatalogSchema } from "~/utils/bucketCatalog.schema";

const label = createLabel("providers", "cyan");

const BUCKETS_LOOKUP_PATH = "/org/buckets";
const BUCKETS_LOOKUP_HEADER = "X-Providers-Lookup-Secret";
const BUCKETS_LOOKUP_TIMEOUT_MS = 10_000;

// Present only in admin-portal builds (EE & SaaS); OSS builds have no portal
// and the bucket is entered as free text — when the source is not `portal`
// this throws. The lookup is advisory: on staleness or unavailability the
// caller degrades to a clear error. Fail-closed fetch-through, memoized per
// organization, with failure backoff so an outage fails fast instead of
// round-tripping the portal per request.
const bucketCatalogCache = createCatalogCache<BucketCatalog>(
  fetchPortalBuckets,
  (organization) => `portal:${organization}`,
);

export async function getBucketCatalog(
  organization: string,
  accessToken?: string,
): Promise<BucketCatalog> {
  return bucketCatalogCache.get(organization, accessToken);
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
