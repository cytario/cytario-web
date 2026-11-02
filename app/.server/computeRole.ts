import { Sha256 } from "@aws-crypto/sha256-browser";
import { SignatureV4 } from "@smithy/signature-v4";

import { hostRequestStorage } from "./hostRequestContext";
import { getProviderCatalog } from "./providers/providerCatalog.server";
import { mapResourceEnvelope } from "./resourceEnvelope";
import { assumeRoleWithWebIdentity, sanitizeRoleSessionName } from "./stsSession";
import type { ComputeRoleSession, SignedFetch } from "@cytario/plugin-api";
import type { ComputeProvider, ProviderCatalog } from "~/utils/providerCatalog.schema";

function requireRequestData() {
  const data = hostRequestStorage.getStore();
  if (!data) {
    throw new Error(
      "Host capabilities called outside a request context — ensure the request pipeline sets up hostRequestStorage before plugin loaders/actions run",
    );
  }
  return data;
}

function findComputeProvider(catalog: ProviderCatalog, providerId?: string): ComputeProvider {
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
  return computeProvider;
}

// AWS-backed providers mint through a per-provider submit role; Kubernetes
// providers carry their own credential on the connection and have no
// ComputeRole rows, so the split happens before the lookup.
function resolveAwsComputeRole(catalog: ProviderCatalog, computeProvider: ComputeProvider) {
  const computeRole = catalog.computeRoles.find((r) => r.computeProviderId === computeProvider.id);
  if (!computeRole) {
    throw new Error(`No compute role found for compute provider "${computeProvider.displayName}"`);
  }
  return computeRole;
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

// The bearer credential is replayable, so the host — never the plugin —
// enforces the origin: any request outside the connection's Kubernetes API
// server origin is rejected before the credential is attached. Same SSRF-guard
// posture as `connectionFetch`.
export function createKubernetesSignedFetch(credential: string, endpoint: string): SignedFetch {
  const allowedOrigin = new URL(endpoint).origin;
  return async (url: string, init?: RequestInit) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== allowedOrigin) {
      throw new Error(
        `Kubernetes session egress violation: request origin "${parsedUrl.origin}" does not match the provider endpoint origin "${allowedOrigin}"`,
      );
    }
    const headers = new Headers(init?.headers ?? {});
    headers.set("Authorization", `Bearer ${credential}`);
    return fetch(url, { ...init, headers });
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
  const computeProvider = findComputeProvider(catalog, providerId);

  const defaultResources = mapResourceEnvelope(computeProvider.typeSpecific.defaultResources);
  const maxResources = mapResourceEnvelope(computeProvider.typeSpecific.maxResources);

  if (computeProvider.type === "KUBERNETES_JOBS") {
    const { typeSpecific } = computeProvider;
    if (!typeSpecific.credential) {
      throw new Error(
        `Compute provider "${computeProvider.displayName}" carries no Kubernetes credential — the session cannot be minted (fail closed).`,
      );
    }
    const signedFetch = createKubernetesSignedFetch(typeSpecific.credential, typeSpecific.endpoint);
    return {
      signedFetch,
      imagePullSecretRef: null,
      providerConfig: {
        namespace: typeSpecific.namespace,
        ...(typeSpecific.imagePullSecrets
          ? { imagePullSecrets: typeSpecific.imagePullSecrets }
          : {}),
        ...(typeSpecific.serviceAccountName
          ? { serviceAccountName: typeSpecific.serviceAccountName }
          : {}),
        ...(typeSpecific.logMode ? { logMode: typeSpecific.logMode } : {}),
        ...(typeSpecific.placement ? { placement: typeSpecific.placement } : {}),
      },
      ...(defaultResources ? { defaultResources } : {}),
      ...(maxResources ? { maxResources } : {}),
    };
  }

  const computeRole = resolveAwsComputeRole(catalog, computeProvider);
  const credentials = await assumeRoleWithWebIdentity({
    roleArn: computeRole.roleArn,
    roleSessionName: sanitizeRoleSessionName(`compute-${user.sub}`),
    webIdentityToken: authTokens.idToken,
    region: computeProvider.region,
  });

  const signedFetch = createBatchSignedFetch(credentials, computeProvider.region);

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
