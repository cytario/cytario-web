import { keepAliveGrant as keepAliveGrantImpl } from "./auth/keepAliveGrant";
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
import { pickGrantForUser } from "~/.server/auth/getSessionCredentials";
import {
  getProviderCatalog,
  resolveConnectionProviderWithGrants,
} from "~/.server/providers/providerCatalog.server";
import { cytarioConfig } from "~/config";
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

// Secret-free projection: strips grants, raw role identifiers, and
// credentials; resolves concrete provider attributes from the catalog.
async function toConnectionProjection(
  config: ConnectionConfigWithGrants,
  accessToken: string,
): Promise<ConnectionProjection> {
  const catalog = await getProviderCatalog(config.organization, accessToken);
  const resolved = resolveConnectionProviderWithGrants(catalog, config);
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
        // The schema defaults this to "harbor"; the fallback only covers a catalog built by hand.
        registryKind: c.registryKind ?? "harbor",
        // "anonymous" means the host sends no Authorization header at all.
        credentialMode: c.accessAccountSecret ? "connection" : "anonymous",
      }));
  }

  connectionFetch(connectionName: string, url: string, init?: RequestInit): Promise<Response> {
    return connectionFetchImpl(connectionName, url, init);
  }

  objectStore(): ObjectStore {
    return createObjectStore();
  }

  assumeComputeRole(
    providerId?: string,
    organizationOverride?: string,
  ): Promise<ComputeRoleSession> {
    return assumeComputeRoleImpl(providerId, organizationOverride);
  }

  exchangeToken(): Promise<TokenGrant> {
    const data = hostRequestStorage.getStore();
    if (!data?.jobGrant) {
      throw new Error(
        "exchangeToken() called outside the job-grant callback phase — the offline grant is only available during the Authorization Code callback (SRS-CY-41901)",
      );
    }
    return Promise.resolve(data.jobGrant);
  }

  brokerPublicUrl(): string {
    const base = cytarioConfig.endpoints.brokerPublicUrl || cytarioConfig.endpoints.webapp;
    return `${base}/api/broker`;
  }

  revokeGrant(offlineSessionId: string): Promise<void> {
    return revokeGrantImpl(offlineSessionId);
  }

  keepAliveGrant(offlineSessionId: string): Promise<void> {
    return keepAliveGrantImpl(offlineSessionId);
  }

  jobLedger(): JobLedger {
    return new JobLedgerImpl();
  }
}

// Carries identifiers only — never token or credential material. Rows are
// organization-scoped under the same tenancy invariants as the connection
// store: organization server-injected and never caller-supplied, org
// pre-filter on read.
class JobLedgerImpl implements JobLedger {
  async record(job: JobRecord): Promise<void> {
    const { user, authTokens } = requireRequestData();
    if (!user.organization) {
      throw new Error("Active organization missing from session");
    }

    // The storage role is resolved host-side here so the broker reads
    // roleArn/region/s3Endpoint from the ledger row at mint time without
    // re-resolving the catalog. Pinning the most permissive grant the user
    // can see keeps the job's credentials within the user's entitlement.
    const connection = await prisma.connectionConfig.findFirst({
      where: { id: job.connectionId, organization: user.organization },
      include: { grants: true },
    });
    if (!connection) {
      throw new Error(
        `Connection ${job.connectionId} not found in organization ${user.organization}`,
      );
    }
    const catalog = await getProviderCatalog(user.organization, authTokens.accessToken);
    const provider = resolveConnectionProviderWithGrants(catalog, connection);
    if (!provider) {
      throw new Error(
        `Provider connection could not be resolved for connection ${job.connectionId}`,
      );
    }
    const grant = pickGrantForUser(provider, user, user.organization);
    if (!grant) {
      throw new Error(`No grant the submitting user can see for connection ${job.connectionId}`);
    }

    // The named compute provider must be one of the active organization's
    // connected providers (tenant boundary — a provider id from another org
    // never resolves).
    const providerCatalog = await getProviderCatalog(user.organization, authTokens.accessToken);
    const computeProvider = job.providerId
      ? providerCatalog.computeProviders.find(
          (p) => p.id === job.providerId && p.status === "connected",
        )
      : undefined;
    if (job.providerId && !computeProvider) {
      throw new Error(
        `Compute provider ${job.providerId} is not a connected provider of organization ${user.organization}`,
      );
    }

    await prisma.jobLedgerEntry.create({
      data: {
        batchId: job.batchId,
        jobId: job.jobId,
        offlineSessionId: job.offlineSessionId,
        organization: user.organization,
        owner: job.owner,
        inputS3Uris: job.inputS3Uris,
        outputS3Uri: job.outputS3Uri,
        connectionId: job.connectionId,
        roleArn: grant.roleArn,
        region: provider.region,
        s3Endpoint: provider.endpoint,
        providerId: job.providerId ?? null,
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
    return entry ? toJobRecord(entry) : null;
  }

  async remove(jobId: string): Promise<void> {
    const { user } = requireRequestData();
    // The deployment-secret carve-out dispatches org-agnostic (no session
    // organization) — the same trust boundary as listAll — so the reconciler
    // removes terminal rows by jobId alone; session callers keep the org filter.
    await prisma.jobLedgerEntry.deleteMany({
      where: user.organization ? { organization: user.organization, jobId } : { jobId },
    });
  }

  async list(): Promise<readonly JobRecord[]> {
    const { user } = requireRequestData();
    if (!user.organization) {
      throw new Error("Active organization missing from session");
    }
    return listLedgerEntries(user.organization);
  }

  // Cross-organization scan for the scheduled reconciler — must only be
  // reachable from the deployment-secret carve-out, never a session path:
  // no organization pre-filter is applied here.
  async listAll(): Promise<readonly JobRecord[]> {
    requireRequestData();
    const entries = await prisma.jobLedgerEntry.findMany({
      orderBy: { createdAt: "asc" },
    });
    return entries.map(toJobRecord);
  }
}

function toJobRecord(entry: {
  batchId: string;
  jobId: string;
  offlineSessionId: string;
  organization: string;
  owner: string;
  providerId?: string | null;
  inputS3Uris: string[];
  outputS3Uri: string;
  connectionId: string;
  roleArn: string;
  region: string;
  s3Endpoint: string | null;
}): JobRecord {
  return {
    batchId: entry.batchId,
    jobId: entry.jobId,
    offlineSessionId: entry.offlineSessionId,
    organization: entry.organization,
    owner: entry.owner,
    ...(entry.providerId ? { providerId: entry.providerId } : {}),
    inputS3Uris: entry.inputS3Uris ?? [],
    outputS3Uri: entry.outputS3Uri ?? "",
    connectionId: entry.connectionId ?? "",
    roleArn: entry.roleArn ?? "",
    region: entry.region ?? "",
    s3Endpoint: entry.s3Endpoint ?? null,
  };
}

async function listLedgerEntries(organization: string): Promise<readonly JobRecord[]> {
  const entries = await prisma.jobLedgerEntry.findMany({
    where: { organization },
    orderBy: { createdAt: "asc" },
  });
  return entries.map(toJobRecord);
}

export const hostCapabilities = new HostCapabilitiesImpl();

export type { HostCapabilitiesImpl, JobLedgerImpl };
