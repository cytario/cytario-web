import { Sha256 } from "@aws-crypto/sha256-browser";
import { SignatureV4 } from "@smithy/signature-v4";

import { hostRequestStorage } from "./hostRequestContext";
import { getProviderCatalog } from "./providers/providerCatalog.server";
import { mapResourceEnvelope } from "./resourceEnvelope";
import { assumeRoleWithWebIdentity, sanitizeRoleSessionName } from "./stsSession";
import type { ComputeRoleSession, SignedFetch } from "@cytario/plugin-api";
import type { ComputeProvider, ComputeRole, ProviderCatalog } from "~/utils/providerCatalog.schema";

function requireRequestData() {
  const data = hostRequestStorage.getStore();
  if (!data) {
    throw new Error(
      "Host capabilities called outside a request context — ensure the request pipeline sets up hostRequestStorage before plugin loaders/actions run",
    );
  }
  return data;
}

function resolveComputeRole(
  catalog: ProviderCatalog,
  providerId?: string,
): {
  computeProvider: ComputeProvider;
  computeRole: ComputeRole;
} {
  const computeProvider = providerId
    ? catalog.computeProviders.find((p) => p.id === providerId && p.status === "connected")
    : catalog.computeProviders.find((p) => p.status === "connected");
  if (!computeProvider) {
    throw new Error(
      providerId
        ? `Compute provider "${providerId}" is not a connected provider of this organization`
        : "No connected compute provider found in the provider catalog",
    );
  }
  const computeRole = catalog.computeRoles.find((r) => r.computeProviderId === computeProvider.id);
  if (!computeRole) {
    throw new Error(`No compute role found for compute provider "${computeProvider.displayName}"`);
  }
  return { computeProvider, computeRole };
}

// The plugin never sees an access key or session token — the host signs
// with the minted credentials. CloudWatch Logs endpoints sign with the
// `logs` service; everything else signs as `batch`.
export function createBatchSignedFetch(
  credentials: { AccessKeyId: string; SecretAccessKey: string; SessionToken?: string },
  region: string,
): SignedFetch {
  const signerCredentials = {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretAccessKey,
    sessionToken: credentials.SessionToken,
  };
  const batchSigner = new SignatureV4({
    credentials: signerCredentials,
    region,
    service: "batch",
    sha256: Sha256,
  });
  const logsSigner = new SignatureV4({
    credentials: signerCredentials,
    region,
    service: "logs",
    sha256: Sha256,
  });

  return async (url: string, init?: RequestInit) => {
    const parsedUrl = new URL(url);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers ?? {});
    const body = init?.body;

    // CloudWatch Logs endpoints need a different SigV4 service scope than Batch.
    const signer = parsedUrl.hostname.startsWith("logs.") ? logsSigner : batchSigner;
    const signed = await signer.sign({
      method,
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      protocol: parsedUrl.protocol as "https:" | "http:",
      // SigV4 requires `host` in the signed-headers set and Smithy does not
      // add it from `hostname`; without it AWS rejects with "'Host' or
      // ':authority' must be a 'SignedHeader'".
      headers: {
        host: parsedUrl.host,
        ...Object.fromEntries(headers.entries()),
      },
      body: typeof body === "string" ? body : undefined,
    });

    return fetch(url, {
      ...init,
      method,
      headers: signed.headers,
      body,
    });
  };
}

// The plugin never sees an access key or a raw session token — the host is
// the only actor that reads them.
export async function assumeComputeRole(
  providerId?: string,
  organizationOverride?: string,
): Promise<ComputeRoleSession> {
  const { user, authTokens } = requireRequestData();
  const organization = organizationOverride ?? user.organization;
  if (!organization) {
    throw new Error("Active organization missing from request context");
  }
  const catalog = await getProviderCatalog(organization, authTokens.accessToken);
  const { computeProvider, computeRole } = resolveComputeRole(catalog, providerId);

  const credentials = await assumeRoleWithWebIdentity({
    roleArn: computeRole.roleArn,
    roleSessionName: sanitizeRoleSessionName(`compute-${user.sub}`),
    webIdentityToken: authTokens.idToken,
    region: computeProvider.region,
  });

  const signedFetch = createBatchSignedFetch(credentials, computeProvider.region);

  const defaultResources = mapResourceEnvelope(computeProvider.typeSpecific.defaultResources);
  const maxResources = mapResourceEnvelope(computeProvider.typeSpecific.maxResources);

  return {
    signedFetch,
    jobQueueArn: computeProvider.typeSpecific.jobQueueArn,
    jobRoleArn: computeProvider.typeSpecific.jobRoleArn,
    executionRoleArn: computeProvider.typeSpecific.executionRoleArn,
    imagePullSecretRef: computeProvider.typeSpecific.imagePullSecretRef,
    ...(computeProvider.typeSpecific.registryPullSecrets
      ? { registryPullSecrets: computeProvider.typeSpecific.registryPullSecrets }
      : {}),
    logGroupName: computeProvider.typeSpecific.logGroupName,
    ...(defaultResources ? { defaultResources } : {}),
    ...(maxResources ? { maxResources } : {}),
  };
}
