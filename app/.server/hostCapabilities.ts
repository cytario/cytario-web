import { exchangeJobToken as exchangeTokenImpl } from "./auth/exchangeJobToken";
import { revokeGrant as revokeGrantImpl } from "./auth/revokeGrant";
import { catalogFetch as connectionFetchImpl } from "./catalogFetch";
import { assumeComputeRole as assumeComputeRoleImpl } from "./computeRole";
import { prisma } from "./db/prisma";
import { hostRequestStorage } from "./hostRequestContext";
import { createObjectStore } from "./objectStore";
import type {
  CatalogConnectionProjection,
  ComputeConnectionProjection,
  ComputeRoleSession,
  ConnectionProjection,
  HostCapabilities,
  JobLedger,
  JobRecord,
  ObjectStore,
  TokenGrant,
} from "@cytario/plugin-api";
import {
  getProviderCatalog,
  resolveConnectionProvider,
} from "~/.server/providers/providerCatalog.server";
import { listConnections } from "~/routes/connections/connections.server";
import type { ConnectionConfigWithGrants } from "~/routes/connections/connections.server";

function requireRequestData() {
  const data = hostRequestStorage.getStore();
  if (!data) {
    throw new Error(
      "Host capabilities called outside a request context — ensure the request pipeline sets up hostRequestStorage before plugin loaders/actions run",
    );
  }
  return data;
}

/**
 * Projects a `ConnectionConfig` (with grants) to a secret-free
 * `ConnectionProjection` — strips grants, raw role identifiers, and
 * credentials (SDS-CY-010097). Resolves the provider type, endpoint, and
 * region from the provider catalog so a plugin receives concrete attributes,
 * not an opaque `providerConnectionId` reference.
 */
async function toConnectionProjection(
  config: ConnectionConfigWithGrants,
  accessToken: string,
): Promise<ConnectionProjection> {
  const catalog = await getProviderCatalog(config.organization, accessToken);
  const resolved = resolveConnectionProvider(catalog, {
    providerConnectionId: config.providerConnectionId,
    providerRoleId: config.grants[0]?.providerRoleId ?? "",
  });
  return {
    id: config.id,
    name: config.name,
    provider: resolved?.providerType ?? "unknown",
    bucketName: config.bucketName,
    prefix: config.prefix,
    endpoint: resolved?.endpoint ?? undefined,
    region: resolved?.region,
  };
}

/**
 * Server-side `HostCapabilities` implementation. Each method resolves the
 * active organization and session from `AsyncLocalStorage` (set up by the
 * request pipeline) so a plugin calls `ctx.host.connections()` without
 * passing an explicit request context (SDS-CY-010094/010097).
 *
 * Capabilities backed by existing host infrastructure (`connections`,
 * `jobLedger`) are fully implemented. Capabilities that require new
 * infrastructure (`connectionFetch`, `userStorage`, `assumeComputeRole`,
 * `exchangeToken`) throw a clear "not configured" error — the type
 * contract is complete so a plugin can typecheck against the spec, and
 * the implementations will be wired when the backing infrastructure lands
 * (catalog connections, user storage connections, compute role config,
 * offline token grants).
 */
class HostCapabilitiesImpl implements HostCapabilities {
  async connections(): Promise<readonly ConnectionProjection[]> {
    const { user, authTokens } = requireRequestData();
    const configs = await listConnections(user);
    return Promise.all(configs.map((c) => toConnectionProjection(c, authTokens.accessToken)));
  }

  async computeConnections(): Promise<readonly ComputeConnectionProjection[]> {
    const { user, authTokens } = requireRequestData();
    if (!user.organization) return [];
    const catalog = await getProviderCatalog(user.organization, authTokens.accessToken);
    return catalog.computeProviders
      .filter((p) => p.status === "connected")
      .map((p) => ({
        id: p.id,
        name: p.displayName,
        type: p.type,
        region: p.region,
      }));
  }

  async catalogConnections(): Promise<readonly CatalogConnectionProjection[]> {
    const { user, authTokens } = requireRequestData();
    if (!user.organization) return [];
    const catalog = await getProviderCatalog(user.organization, authTokens.accessToken);
    return catalog.appCatalogs
      .filter((c) => c.enabled && c.status === "connected")
      .map((c) => ({
        id: c.id,
        name: c.displayName,
        registryEndpoint: c.registryEndpoint,
        namespace: c.namespace,
        allowedGroups: c.allowedGroups,
      }));
  }

  connectionFetch(connectionName: string, url: string, init?: RequestInit): Promise<Response> {
    return connectionFetchImpl(connectionName, url, init);
  }

  objectStore(): ObjectStore {
    return createObjectStore();
  }

  assumeComputeRole(): Promise<ComputeRoleSession> {
    return assumeComputeRoleImpl();
  }

  exchangeToken(): Promise<TokenGrant> {
    return exchangeTokenImpl();
  }

  revokeGrant(offlineSessionId: string): Promise<void> {
    return revokeGrantImpl(offlineSessionId);
  }

  jobLedger(): JobLedger {
    return new JobLedgerImpl();
  }
}

/**
 * Host-owned running-jobs ledger (SDS-CY-080900, SDS-CY-010099). Carries
 * identifiers only — the provider job identifier, the grant's offline-
 * session identifier, the organization, and the submitting user — never
 * token or credential material. Rows are organization-scoped under the
 * same tenancy invariants as the connection store (organization
 * server-injected and never caller-supplied, org pre-filter on read).
 */
class JobLedgerImpl implements JobLedger {
  async record(job: JobRecord): Promise<void> {
    const { user } = requireRequestData();
    if (!user.organization) {
      throw new Error("Active organization missing from session");
    }
    await prisma.jobLedgerEntry.create({
      data: {
        jobId: job.jobId,
        offlineSessionId: job.offlineSessionId,
        organization: user.organization,
        owner: job.owner,
      },
    });
  }

  async lookup(jobId: string): Promise<JobRecord | null> {
    const { user } = requireRequestData();
    if (!user.organization) {
      throw new Error("Active organization missing from session");
    }
    const entry = await prisma.jobLedgerEntry.findFirst({
      where: { organization: user.organization, jobId },
    });
    if (!entry) return null;
    return {
      jobId: entry.jobId,
      offlineSessionId: entry.offlineSessionId,
      organization: entry.organization,
      owner: entry.owner,
    };
  }

  async remove(jobId: string): Promise<void> {
    const { user } = requireRequestData();
    if (!user.organization) {
      throw new Error("Active organization missing from session");
    }
    await prisma.jobLedgerEntry.deleteMany({
      where: { organization: user.organization, jobId },
    });
  }

  async list(): Promise<readonly JobRecord[]> {
    const { user } = requireRequestData();
    if (!user.organization) {
      throw new Error("Active organization missing from session");
    }
    const entries = await prisma.jobLedgerEntry.findMany({
      where: { organization: user.organization },
      orderBy: { createdAt: "asc" },
    });
    return entries.map((entry) => ({
      jobId: entry.jobId,
      offlineSessionId: entry.offlineSessionId,
      organization: entry.organization,
      owner: entry.owner,
    }));
  }
}

export const hostCapabilities = new HostCapabilitiesImpl();

export type { HostCapabilitiesImpl, JobLedgerImpl };
