import { load as loadYaml } from "js-yaml";
import { readFile } from "node:fs/promises";

import { createLabel } from "~/.server/logging";
import { findBucketByName } from "~/.server/providers/bucketCatalog.server";
import { cytarioConfig } from "~/config";
import type { BucketCatalog } from "~/utils/bucketCatalog.schema";
import {
  type AccessLevel,
  type ProviderCatalog,
  type ProviderConnection,
  type ProviderRole,
  isAccessLevel,
  providerCatalogSchema,
} from "~/utils/providerCatalog.schema";

const label = createLabel("providers", "cyan");

const PROVIDERS_LOOKUP_PATH = "/org/providers";
const PROVIDERS_LOOKUP_HEADER = "X-Providers-Lookup-Secret";
const PROVIDERS_LOOKUP_TIMEOUT_MS = 10_000;

/** How long a resolved catalog is served from memory before re-reading its source. */
const CATALOG_CACHE_TTL_MS = 30_000;
const CATALOG_CACHE_MAX_ENTRIES = 100;

interface CatalogCacheEntry {
  expiresAt: number;
  promise: Promise<ProviderCatalog>;
}

const catalogCache = new Map<string, CatalogCacheEntry>();

/** Test hook: drop every cached catalog. */
export function clearProviderCatalogCache(): void {
  catalogCache.clear();
}

/**
 * Invalidate the provider-catalog cache for an organization's catalog
 * connection (SRS-CY-414106). The cache key is `(organization, catalog
 * connection)`: the entry holding the connection's `allowedGroups` access
 * scope (SRS-CY-39806) is evicted so the next `getProviderCatalog` re-fetches
 * fresh data from the portal. Call this when the access scope changes on a
 * catalog connection or when the connection is removed — a stale
 * `allowedGroups` set must never be served across an access-scope change.
 *
 * The cache is keyed per organization (the portal `GET /org/providers`
 * response is whole-org), so the `catalogConnectionId` is accepted for
 * caller intent and observability and scopes the eviction to the org whose
 * catalog holds that connection.
 */
export function invalidateProviderCatalogCache(
  organization: string,
  catalogConnectionId?: string,
): void {
  const fromPortal = cytarioConfig.providers.source === "portal";
  const cacheKey = fromPortal ? `portal:${organization}` : "oss";
  const evicted = catalogCache.delete(cacheKey);
  if (evicted && catalogConnectionId) {
    console.info(
      `${label} Provider catalog cache invalidated for org "${organization}" on catalog connection "${catalogConnectionId}" (access-scope change or removal).`,
    );
  }
}

/**
 * Resolves the active organization's provider catalog — the provider connections
 * and provider roles a storage connection may be composed from.
 *
 * The build source is fixed by admin-portal presence (`cytarioConfig.providers.source`):
 *  - `portal` (EE/SaaS): read from the admin portal lookup;
 *  - `oss`: read from the deploy-time YAML file.
 *
 * The lookup is advisory: on staleness or unavailability the caller degrades to a
 * clear error and never blocks an already-created connection.
 *
 * Resolved catalogs are memoized per organization with a short TTL — the catalog
 * is consulted on every credential-bearing request, and neither the portal
 * round-trip nor the YAML read should run per request. Failures are never cached.
 */
export async function getProviderCatalog(
  organization: string,
  accessToken?: string,
): Promise<ProviderCatalog> {
  const fromPortal = cytarioConfig.providers.source === "portal";
  const cacheKey = fromPortal ? `portal:${organization}` : "oss";

  const cached = catalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = (
    fromPortal ? fetchPortalCatalog(organization, accessToken) : loadOssCatalog()
  ).catch((error: unknown) => {
    catalogCache.delete(cacheKey);
    throw error;
  });

  if (catalogCache.size >= CATALOG_CACHE_MAX_ENTRIES) {
    const oldestKey = catalogCache.keys().next().value;
    if (oldestKey !== undefined) catalogCache.delete(oldestKey);
  }
  catalogCache.set(cacheKey, { expiresAt: Date.now() + CATALOG_CACHE_TTL_MS, promise });
  return promise;
}

async function fetchPortalCatalog(
  organization: string,
  accessToken?: string,
): Promise<ProviderCatalog> {
  const { portalInternalUrl, lookupSecret } = cytarioConfig.providers;
  if (!portalInternalUrl || !lookupSecret) {
    throw new Error(
      "Provider lookup is misconfigured: PORTAL_INTERNAL_URL and PROVIDERS_LOOKUP_SECRET are required in an admin-portal build.",
    );
  }

  const url = new URL(PROVIDERS_LOOKUP_PATH, ensureTrailingSlash(portalInternalUrl));
  url.searchParams.set("org", organization);

  const headers: Record<string, string> = {
    [PROVIDERS_LOOKUP_HEADER]: lookupSecret,
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(PROVIDERS_LOOKUP_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`${label} Provider lookup request failed:`, error);
    throw new Error("Provider lookup is currently unavailable. Try again shortly.");
  }

  if (!response.ok) {
    console.error(`${label} Provider lookup returned ${response.status}`);
    throw new Error("Provider lookup is currently unavailable. Try again shortly.");
  }

  const raw = await response.json();
  return providerCatalogSchema.parse(raw);
}

async function loadOssCatalog(): Promise<ProviderCatalog> {
  const { ossConfigPath } = cytarioConfig.providers;
  if (!ossConfigPath) {
    throw new Error(
      "Provider catalog is misconfigured: PROVIDERS_OSS_CONFIG_PATH is required in an OSS build.",
    );
  }

  let fileContents: string;
  try {
    fileContents = await readFile(ossConfigPath, "utf8");
  } catch (error) {
    console.error(`${label} Failed to read OSS provider config at ${ossConfigPath}:`, error);
    throw new Error(`Provider catalog file could not be read at ${ossConfigPath}.`);
  }

  const parsed = loadYaml(fileContents);
  return providerCatalogSchema.parse(parsed);
}

function ensureTrailingSlash(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

/** Look up a provider connection by id within a catalog. */
export function findProviderConnection(
  catalog: ProviderCatalog,
  providerConnectionId: string,
): ProviderConnection | undefined {
  return catalog.providerConnections.find((c) => c.id === providerConnectionId);
}

/**
 * Look up the provider role that backs an access level on a storage connection:
 * exactly one role is provisioned per (provider connection, bucket, level), so
 * the level + connection pin the role. When the bucket catalog row id is known
 * it must match (`bucketIds`), otherwise the first role with the level under
 * the provider connection is used — with one role per (bucket, level) and
 * per-bucket connections this is unambiguous, but prefer the exact bucket
 * whenever the caller can supply the bucket catalog.
 */
export function findStorageRole(
  catalog: ProviderCatalog,
  refs: { providerConnectionId: string; accessLevel: AccessLevel; bucketId?: string },
): ProviderRole | undefined {
  return catalog.providerRoles.find(
    (r) =>
      r.providerConnectionId === refs.providerConnectionId &&
      r.accessLevel === refs.accessLevel &&
      (refs.bucketId === undefined || r.bucketIds.includes(refs.bucketId)),
  );
}

/**
 * The concrete AWS attributes a resolved connection carries: the provider
 * connection's type/endpoint/region plus the resolved storage role's ARN and
 * level.
 */
export interface ConnectionProvider {
  providerType: ProviderConnection["providerType"];
  endpoint: string | null;
  region: string;
  roleArn: string;
  allowedScopes: string[];
  accessLevel: AccessLevel;
}

/**
 * A single grant resolved against the catalog: the grant's persisted scope +
 * the concrete provider-role attributes (roleArn, accessLevel) it maps to.
 */
export interface ResolvedConnectionGrant {
  scope: string;
  roleArn: string;
  accessLevel: AccessLevel;
}

/**
 * The connection-level provider attributes resolved from the catalog: region and
 * endpoint come from the provider connection (shared by every grant on the
 * connection); `allowsSharing` is true when ANY of the connection's resolvable
 * grants' roles is an Admin-level role (`accessLevel === "admin"`). The per-grant
 * `roleArn` lives on the `ResolvedConnectionGrant` entries.
 */
export interface ResolvedConnectionProviderWithGrants {
  providerType: ProviderConnection["providerType"];
  endpoint: string | null;
  region: string;
  allowsSharing: boolean;
  grants: ResolvedConnectionGrant[];
}

/**
 * Resolve a connection's provider connection and ALL of its grants against the
 * catalog. Each grant carries an access level; the concrete storage role for
 * that level on the connection's bucket is resolved here — the portal
 * provisions exactly one role per (connection, bucket, level), so the level
 * pins the role. When the bucket catalog is supplied the role is matched on
 * the connection's bucket row id; otherwise the first role with the level
 * under the provider connection is used.
 *
 * Returns `undefined` when the provider connection itself is absent
 * (a stale lookup); grants whose level has no role for the bucket are
 * silently dropped from the resolved set (they cannot contribute a
 * Principal or a credential).
 */
export function resolveConnectionProviderWithGrants(
  catalog: ProviderCatalog,
  connection: {
    providerConnectionId: string;
    bucketName: string;
    grants: Array<{ scope: string; accessLevel: string }>;
  },
  bucketCatalog?: BucketCatalog,
): ResolvedConnectionProviderWithGrants | undefined {
  const providerConnection = findProviderConnection(catalog, connection.providerConnectionId);
  if (!providerConnection) return undefined;

  const bucketRow = bucketCatalog
    ? findBucketByName(bucketCatalog, providerConnection.id, connection.bucketName)
    : undefined;

  const grants: ResolvedConnectionGrant[] = [];
  let allowsSharing = false;
  for (const grant of connection.grants) {
    if (!isAccessLevel(grant.accessLevel)) continue;
    const providerRole = findStorageRole(catalog, {
      providerConnectionId: providerConnection.id,
      accessLevel: grant.accessLevel,
      ...(bucketRow ? { bucketId: bucketRow.id } : {}),
    });
    if (!providerRole) continue;
    grants.push({
      scope: grant.scope,
      roleArn: providerRole.roleArn,
      accessLevel: providerRole.accessLevel,
    });
    if (providerRole.accessLevel === "admin") allowsSharing = true;
  }

  return {
    providerType: providerConnection.providerType,
    endpoint: providerConnection.endpoint,
    region: providerConnection.region,
    allowsSharing,
    grants,
  };
}
