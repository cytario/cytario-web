import { load as loadYaml } from "js-yaml";
import { readFile } from "node:fs/promises";

import { createLabel } from "~/.server/logging";
import { cytarioConfig } from "~/config";
import {
  type ProviderCatalog,
  type ProviderConnection,
  type ProviderRole,
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

/** Look up a provider role by id within a catalog. */
export function findProviderRole(
  catalog: ProviderCatalog,
  providerRoleId: string,
): ProviderRole | undefined {
  return catalog.providerRoles.find((r) => r.id === providerRoleId);
}

/**
 * The concrete AWS attributes a stored connection references but does not store
 * itself. Resolved by joining the connection's `providerConnectionId` /
 * `providerRoleId` against the catalog.
 */
export interface ResolvedConnectionProvider {
  providerType: ProviderConnection["providerType"];
  endpoint: string | null;
  region: string;
  roleArn: string;
  allowedScopes: string[];
  allowsSharing: boolean;
}

/**
 * Resolve a stored connection's provider-connection / provider-role references to
 * their concrete AWS attributes, or `undefined` when either reference is absent
 * from the catalog (e.g. a stale lookup). Callers degrade to a clear error rather
 * than blocking an already-created connection.
 */
export function resolveConnectionProvider(
  catalog: ProviderCatalog,
  connection: { providerConnectionId: string; providerRoleId: string },
): ResolvedConnectionProvider | undefined {
  const providerConnection = findProviderConnection(catalog, connection.providerConnectionId);
  const providerRole = findProviderRole(catalog, connection.providerRoleId);
  if (!providerConnection || !providerRole) return undefined;
  if (providerRole.providerConnectionId !== providerConnection.id) return undefined;

  return {
    providerType: providerConnection.providerType,
    endpoint: providerConnection.endpoint,
    region: providerConnection.region,
    roleArn: providerRole.roleArn,
    allowedScopes: providerRole.allowedScopes,
    allowsSharing: providerRole.allowsSharing,
  };
}

/**
 * A single grant resolved against the catalog: the grant's persisted scope +
 * the concrete provider-role attributes (roleArn, allowsSharing) it maps to.
 */
export interface ResolvedConnectionGrant {
  scope: string;
  roleArn: string;
  allowsSharing: boolean;
}

/**
 * The connection-level provider attributes resolved from the catalog: region and
 * endpoint come from the provider connection (shared by every grant on the
 * connection); `allowsSharing` is true when ANY of the connection's resolvable
 * grants' roles permits sharing. The per-grant `roleArn` lives on the
 * `ResolvedConnectionGrant` entries.
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
 * catalog. Returns `undefined` when the provider connection itself is absent
 * (a stale lookup); grants whose provider role is absent are silently dropped
 * from the resolved set (they cannot contribute a Principal or a credential).
 */
export function resolveConnectionProviderWithGrants(
  catalog: ProviderCatalog,
  connection: {
    providerConnectionId: string;
    grants: Array<{ scope: string; providerRoleId: string }>;
  },
): ResolvedConnectionProviderWithGrants | undefined {
  const providerConnection = findProviderConnection(catalog, connection.providerConnectionId);
  if (!providerConnection) return undefined;

  const grants: ResolvedConnectionGrant[] = [];
  let allowsSharing = false;
  for (const grant of connection.grants) {
    const providerRole = findProviderRole(catalog, grant.providerRoleId);
    if (!providerRole || providerRole.providerConnectionId !== providerConnection.id) continue;
    grants.push({
      scope: grant.scope,
      roleArn: providerRole.roleArn,
      allowsSharing: providerRole.allowsSharing,
    });
    if (providerRole.allowsSharing) allowsSharing = true;
  }

  return {
    providerType: providerConnection.providerType,
    endpoint: providerConnection.endpoint,
    region: providerConnection.region,
    allowsSharing,
    grants,
  };
}
