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

/**
 * Resolves the compute provider and submit role from the provider catalog.
 * When `providerId` is supplied, resolves that specific connected provider;
 * when omitted, the organization's first connected provider. The submit
 * role is the IAM role the host assumes via `AssumeRoleWithWebIdentity` to
 * make Batch API calls on behalf of the plugin (SDS-CY-010098).
 */
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

/**
 * Creates a `SignedFetch` backed by STS credentials for AWS service
 * endpoints. The plugin calls `session.signedFetch(url, init)` and the host
 * signs the request with the minted credentials — the plugin never sees an
 * access key or session token. CloudWatch Logs endpoints sign with the
 * `logs` service; everything else signs as `batch` (SDS-CY-010098).
 */
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
      // SigV4 requires `host` in the signed-headers set; Smithy does not
      // add it from `hostname`, so it must be supplied explicitly (the S3
      // signer in `signedFetch.ts` does the same). Without it AWS rejects
      // with "'Host' or ':authority' must be a 'SignedHeader'".
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

/**
 * Server-side `assumeComputeRole` implementation. Resolves the compute
 * submit role from the provider catalog, mints an STS session via
 * `AssumeRoleWithWebIdentity` with the user's id token, and returns a
 * `ComputeRoleSession` with a `signedFetch` that signs AWS Batch API
 * requests with the minted credentials (SDS-CY-010098).
 *
 * The plugin never sees an access key or a raw session token — the host
 * is the only actor that reads them, preserving the outbound-credential-
 * surface invariant (§6.8).
 */
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
    logGroupName: computeProvider.typeSpecific.logGroupName,
    ...(defaultResources ? { defaultResources } : {}),
    ...(maxResources ? { maxResources } : {}),
  };
}
