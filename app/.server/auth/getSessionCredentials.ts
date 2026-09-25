import { AssumeRoleWithWebIdentityCommand, Credentials, STSClient } from "@aws-sdk/client-sts";

import { InlinePolicySizeError, buildSessionPolicy } from "./sessionPolicy";
import { type ConnectionsCredentials, type SessionData } from "./sessionStorage";
import type { ConnectionConfig, ConnectionGrant } from "~/.generated/client";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { createLabel } from "~/.server/logging";
import { findBucketByName, getBucketCatalog } from "~/.server/providers/bucketCatalog.server";
import {
  type ResolvedConnectionGrant,
  type ResolvedConnectionProviderWithGrants,
  getProviderCatalog,
  resolveConnectionProviderWithGrants,
} from "~/.server/providers/providerCatalog.server";
import { sanitizeRoleSessionName } from "~/.server/stsSession";
import { cytarioConfig } from "~/config";
import { canSee } from "~/utils/authorization";
import { STS_STALENESS_BUFFER_MS } from "~/utils/credentialsRefresh";
import {
  type AccessLevel,
  type ProviderCatalog,
  ACCESS_LEVELS,
} from "~/utils/providerCatalog.schema";
import { getS3ProviderConfig } from "~/utils/s3Provider";

type ConnectionConfigWithGrants = ConnectionConfig & { grants: ConnectionGrant[] };
const label = createLabel("credentials", "cyan");

export const isValidCredentials = (credentials?: { Expiration?: Date }): boolean => {
  if (!credentials?.Expiration) return false;

  return Date.now() < new Date(credentials.Expiration).getTime() - STS_STALENESS_BUFFER_MS;
};

export { sanitizeRoleSessionName };

interface SessionCredentialRequest {
  connectionConfig: ConnectionConfig;
  grant: ResolvedConnectionGrant;
  connectionProvider: ResolvedConnectionProviderWithGrants;
  // The bucket catalog is the per-bucket source — a bucket may live in a
  // different region than its provider connection's default.
  bucketRegion?: string;
  sessionData: SessionData;
  roleSessionName: string;
}

const fetchTemporaryCredentials = async ({
  connectionConfig,
  grant,
  connectionProvider,
  bucketRegion,
  sessionData,
  roleSessionName,
}: SessionCredentialRequest): Promise<Credentials> => {
  const { bucketName, prefix } = connectionConfig;
  const { roleArn, accessLevel } = grant;
  const region = bucketRegion ?? connectionProvider.region;
  const { endpoint, providerType } = connectionProvider;
  const { idToken } = sessionData.authTokens;

  const providerConfig = getS3ProviderConfig(endpoint, region, providerType);

  const stsClient = new STSClient({
    endpoint: providerConfig.stsEndpoint,
    region,
  });

  // Inline session policy: STS applies it as a filter over the session's
  // entitlement, so the minted credential cannot exceed the configured prefix
  // scope even if the assumed identity is broader. It is a closed allowlist
  // that grants no `s3:PutBucketPolicy`. On AWS it must enumerate
  // `kms:Decrypt` so the role's per-key grants survive the STS intersection
  // and `GetObject` works against SSE-KMS-encrypted objects (omitting
  // `kms:Decrypt` denies it for the session regardless of the role policy).
  // The ORG tenant binding is enforced by the role's trust policy (AWS) or the
  // mapped per-org admission policy (RustFS), never repeated here. Providers
  // whose STS ignores or rejects the `Policy` parameter omit it — the assumed
  // identity's attached policy is then the only bound.
  const Policy = providerConfig.honorsInlineSessionPolicy
    ? buildSessionPolicy({ bucketName, prefix, region, accessLevel })
    : undefined;

  console.info(`${label} Policy: ${Policy}`);
  const command = new AssumeRoleWithWebIdentityCommand({
    RoleArn: roleArn,
    RoleSessionName: roleSessionName,
    WebIdentityToken: idToken,
    DurationSeconds: 60 * 60 * 1, // 1 hour
    ...(Policy ? { Policy } : {}),
  });

  const { Credentials } = await stsClient.send(command);

  if (!Credentials) {
    throw new Error("No credentials returned from STS");
  }
  return Credentials;
};

// Highest applicable access level wins, so a user holding both `annotate`
// and `read-only` grants on the same connection is not demoted.
export const pickGrantForUser = (
  connectionProvider: ResolvedConnectionProviderWithGrants,
  user: UserProfile,
  organization: string,
): ResolvedConnectionGrant | undefined => {
  const applicable = connectionProvider.grants.filter((grant) =>
    canSee(user, { organization, ownerScope: grant.scope }),
  );
  if (applicable.length === 0) return undefined;
  applicable.sort(
    (a, b) => ACCESS_LEVELS.indexOf(b.accessLevel) - ACCESS_LEVELS.indexOf(a.accessLevel),
  );
  return applicable[0];
};

/** Map an STS error to a single-line human-readable reason. */
const describeCredentialError = (error: unknown): string => {
  if (error instanceof InlinePolicySizeError) {
    return `Inline session policy size ceiling exceeded (${error.actualLength} > ${error.ceiling} chars). Shorten the connection prefix or bucket name.`;
  }
  if (error && typeof error === "object" && "name" in error) {
    const name = String((error as { name?: string }).name ?? "");
    if (name === "AccessDenied") {
      return "AWS STS denied AssumeRoleWithWebIdentity. Verify the role's trust policy allows this user / organization.";
    }
    if (name === "ExpiredTokenException" || name === "InvalidIdentityToken") {
      return "The identity token was rejected by AWS STS. Try signing in again.";
    }
  }
  if (error instanceof Error) return error.message;
  return "Failed to fetch temporary credentials.";
};

/** Non-secret provider attributes shipped to the client data-plane (region/endpoint). */
export interface ClientConnectionProvider {
  region: string;
  endpoint: string | null;
  allowsSharing: boolean;
  // Advisory UI gate; S3 denies enforce the actual permission boundary.
  accessLevel: AccessLevel;
}

export interface SessionCredentialsResult {
  credentials: ConnectionsCredentials;
  errors: Record<string, string>;
  // Never a role ARN or credential; absent for a connection whose catalog
  // reference is stale/unavailable.
  providers: Record<string, ClientConnectionProvider>;
}

// The catalog lookup is advisory: when unavailable or a reference is stale,
// the affected connection surfaces a per-connection error rather than
// blocking the others. Keys credentials by connection id so connections
// sharing a bucket but resolving to different roles each get their own mint.
export const getAllSessionCredentials = async (
  sessionData: SessionData,
  connectionConfigs: ConnectionConfigWithGrants[],
): Promise<SessionCredentialsResult> => {
  if (connectionConfigs.length === 0) {
    return { credentials: sessionData.credentials, errors: {}, providers: {} };
  }

  const roleSessionName = sanitizeRoleSessionName(sessionData.user.name);
  const organization = sessionData.user.organization ?? "";

  let catalog: ProviderCatalog | undefined;
  let catalogError: string | undefined;
  try {
    catalog = await getProviderCatalog(organization, sessionData.authTokens.accessToken);
  } catch (error) {
    catalogError = error instanceof Error ? error.message : "Provider catalog is unavailable.";
    console.warn(`${label} Provider catalog lookup failed: ${catalogError}`);
  }

  // A bucket can live in a different region than its provider connection's
  // default, and the session policy's kms:ViaService condition must name the
  // bucket's region. Portal builds only; unavailability degrades to the
  // connection region.
  let bucketCatalog: Awaited<ReturnType<typeof getBucketCatalog>> | undefined;
  if (cytarioConfig.providers.source === "portal") {
    try {
      bucketCatalog = await getBucketCatalog(organization, sessionData.authTokens.accessToken);
    } catch {
      bucketCatalog = undefined;
    }
  }

  const bucketRegionOf = (connectionConfig: ConnectionConfig): string | undefined =>
    bucketCatalog
      ? (findBucketByName(
          bucketCatalog,
          connectionConfig.providerConnectionId,
          connectionConfig.bucketName,
        )?.region ?? undefined)
      : undefined;

  // Resolved for every connection so the client data-plane can address the
  // bucket even when the STS credential is still cached and no mint runs this
  // request.
  const providers: Record<string, ClientConnectionProvider> = {};
  if (catalog) {
    for (const connectionConfig of connectionConfigs) {
      const connectionProvider = resolveConnectionProviderWithGrants(
        catalog,
        connectionConfig,
        bucketCatalog,
      );
      if (connectionProvider) {
        const grant = pickGrantForUser(connectionProvider, sessionData.user, organization);
        providers[connectionConfig.id] = {
          region: bucketRegionOf(connectionConfig) ?? connectionProvider.region,
          endpoint: connectionProvider.endpoint,
          allowsSharing: connectionProvider.allowsSharing,
          accessLevel: grant?.accessLevel ?? "read-only",
        };
      }
    }
  }

  const connectionsNeedingRefresh = connectionConfigs.filter(
    (connectionConfig) => !isValidCredentials(sessionData.credentials[connectionConfig.id]),
  );

  if (connectionsNeedingRefresh.length === 0) {
    return { credentials: sessionData.credentials, errors: {}, providers };
  }

  console.info(
    `${label} Fetching credentials for ${connectionsNeedingRefresh.length} connection(s)`,
  );

  const credentialResults = await Promise.allSettled(
    connectionsNeedingRefresh.map(async (connectionConfig) => {
      if (!catalog) {
        throw new Error(catalogError ?? "Provider catalog is unavailable.");
      }
      const connectionProvider = resolveConnectionProviderWithGrants(
        catalog,
        connectionConfig,
        bucketCatalog,
      );
      if (!connectionProvider) {
        throw new Error(
          "This connection references a provider connection or role that is no longer available. Ask an administrator to check the storage onboarding.",
        );
      }
      const grant = pickGrantForUser(connectionProvider, sessionData.user, organization);
      if (!grant) {
        throw new Error("You are not a member of any group granted access to this connection.");
      }
      return {
        id: connectionConfig.id,
        name: connectionConfig.name,
        credentials: await fetchTemporaryCredentials({
          connectionConfig,
          grant,
          connectionProvider,
          bucketRegion: bucketRegionOf(connectionConfig),
          sessionData,
          roleSessionName,
        }),
      };
    }),
  );

  const newCredentials = { ...sessionData.credentials };
  const errors: Record<string, string> = {};
  credentialResults.forEach((credentialResult, i) => {
    if (credentialResult.status === "fulfilled") {
      newCredentials[credentialResult.value.id] = credentialResult.value.credentials;
    } else {
      const connectionConfig = connectionsNeedingRefresh[i];
      const reason = describeCredentialError(credentialResult.reason);
      errors[connectionConfig.id] = reason;
      console.warn(`${label} Failed to fetch credentials for ${connectionConfig.name}: ${reason}`);
    }
  });

  return { credentials: newCredentials, errors, providers };
};
