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
const CATALOG_CACHE_TTL_MS = cytarioConfig.providers.catalogCacheTtlMs;
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

// Call this when the access scope changes on a catalog connection or when
// the connection is removed — a stale `allowedGroups` set must never be
// served across an access-scope change. The cache is keyed per organization
// (the portal response is whole-org), so `catalogConnectionId` is accepted
// only for caller intent and observability.
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

// The lookup is advisory: on staleness or unavailability the caller degrades
// to a clear error rather than blocking. Memoized per organization with a
// short TTL (portal round-trip / YAML read should not run per request;
// CATALOG_CACHE_TTL_MS `0` disables). Failures are never cached.
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

// Exactly one role is provisioned per (provider connection, bucket, level),
// so the level + connection pin the role; when the bucket row id is known it
// must match, otherwise the first role with the level under the connection
// is used.
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

export interface ConnectionProvider {
  providerType: ProviderConnection["providerType"];
  endpoint: string | null;
  region: string;
  roleArn: string;
  allowedScopes: string[];
  accessLevel: AccessLevel;
}

export interface ResolvedConnectionGrant {
  scope: string;
  roleArn: string;
  accessLevel: AccessLevel;
}

// `allowsSharing` is true when ANY of the connection's resolvable grants'
// roles is Admin-level; the per-grant `roleArn` lives on the grants.
export interface ResolvedConnectionProviderWithGrants {
  providerType: ProviderConnection["providerType"];
  endpoint: string | null;
  region: string;
  allowsSharing: boolean;
  grants: ResolvedConnectionGrant[];
}

// The portal provisions exactly one role per (connection, bucket, level), so
// the grant's level pins the role; with the bucket catalog supplied the role
// is matched on the bucket row id. Grants whose level has no role for the
// bucket are silently dropped (they cannot contribute a Principal or a
// credential); `undefined` means the provider connection itself is stale.
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
