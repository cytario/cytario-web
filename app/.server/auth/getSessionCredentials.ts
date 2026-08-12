import { AssumeRoleWithWebIdentityCommand, Credentials, STSClient } from "@aws-sdk/client-sts";

import { InlinePolicySizeError, buildSessionPolicy } from "./sessionPolicy";
import { type ConnectionsCredentials, type SessionData } from "./sessionStorage";
import type { ConnectionConfig, ConnectionGrant } from "~/.generated/client";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { createLabel } from "~/.server/logging";
import {
  type ResolvedConnectionGrant,
  type ResolvedConnectionProviderWithGrants,
  getProviderCatalog,
  resolveConnectionProviderWithGrants,
} from "~/.server/providers/providerCatalog.server";
import { sanitizeRoleSessionName } from "~/.server/stsSession";
import { canSee } from "~/utils/authorization";
import { STS_STALENESS_BUFFER_MS } from "~/utils/credentialsRefresh";
import {
  type AccessLevel,
  type ProviderCatalog,
  ACCESS_LEVELS,
} from "~/utils/providerCatalog.schema";
import { getS3ProviderConfig } from "~/utils/s3Provider";

/** A connection config with its grants eager-loaded (the shape credential minting needs). */
type ConnectionConfigWithGrants = ConnectionConfig & { grants: ConnectionGrant[] };

const label = createLabel("credentials", "cyan");

export const isValidCredentials = (credentials?: { Expiration?: Date }): boolean => {
  if (!credentials?.Expiration) return false;

  return Date.now() < new Date(credentials.Expiration).getTime() - STS_STALENESS_BUFFER_MS;
};

export { sanitizeRoleSessionName };

const fetchTemporaryCredentials = async (
  connectionConfig: ConnectionConfig,
  roleArn: string,
  region: string,
  endpoint: string | null,
  idToken: string,
  roleSessionName: string,
  subject: string,
  accessLevel: AccessLevel,
): Promise<Credentials> => {
  const { bucketName, prefix } = connectionConfig;

  const providerConfig = getS3ProviderConfig(endpoint, region);

  const stsClient = new STSClient({
    endpoint: providerConfig.stsEndpoint,
    region,
  });

  // Inline session policy is an AWS-specific STS feature: STS applies it as a
  // filter over the role's attached policy, so the minted credential cannot
  // exceed the configured prefix scope even if the role itself is broader. It
  // is a closed allowlist that grants no `s3:PutBucketPolicy`. It must
  // enumerate `kms:Decrypt` so the role's per-key grants survive the STS
  // intersection and `GetObject` works against SSE-KMS-encrypted objects
  // (omitting `kms:Decrypt` denies it for the session regardless of the role
  // policy). The ORG tenant binding is enforced by the role's trust policy,
  // not repeated here. S3-compatible providers whose STS ignores/rejects
  // `Policy` (notably MinIO, signalled by a non-AWS endpoint) omit it — the
  // role's attached policy is then the only bound.
  const Policy = providerConfig.isAwsS3
    ? buildSessionPolicy({ bucketName, prefix, subject, region, accessLevel })
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

/**
 * Pick the most permissive grant whose scope the authenticated user can see
 * (group membership or admin ancestry). A user who is a member of several
 * granted groups receives the grant with the highest access level — so an
 * `annotate` (or `read-write`) user who also holds a `read-only` grant on the
 * same connection is not demoted. Returns `undefined` when no grant is
 * applicable to the user (the connection is visible only through an ancestor
 * the user does not directly hold).
 */
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
  /** Whether the connection's provider role permits onward sharing. */
  allowsSharing: boolean;
}

export interface SessionCredentialsResult {
  credentials: ConnectionsCredentials;
  /** Reason string per connection name for connections whose STS mint failed. */
  errors: Record<string, string>;
  /**
   * Per-connection resolved non-secret provider attributes (region/endpoint) for
   * the client data-plane — never a role ARN or credential. Absent for a
   * connection whose catalog reference is stale/unavailable.
   */
  providers: Record<string, ClientConnectionProvider>;
}

/**
 * Fetches credentials for all connection configs in parallel.
 *
 * A connection no longer carries its own provider/endpoint/roleArn/region — those
 * live on the portal-managed (or OSS-configured) provider connection + provider
 * role the connection references. We resolve each connection's concrete AWS
 * attributes from the organization's provider catalog before minting.
 *
 * Keys credentials by `config.name` so connections that share a bucket but resolve
 * to different roles each get their own STS mint. Only fetches for connections
 * with missing or expired credentials. The catalog lookup is advisory: when it is
 * unavailable or a reference is stale, the affected connection surfaces a clear
 * per-connection error rather than blocking the others.
 */
export const getAllSessionCredentials = async (
  sessionData: SessionData,
  connectionConfigs: ConnectionConfigWithGrants[],
): Promise<SessionCredentialsResult> => {
  // Nothing to resolve or mint when the org has no connections — avoid a needless
  // provider lookup.
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

  // Resolve the non-secret provider attributes (region/endpoint) for every
  // connection so the client data-plane can address the bucket even when the STS
  // credential is still cached and no mint runs this request.
  const providers: Record<string, ClientConnectionProvider> = {};
  if (catalog) {
    for (const config of connectionConfigs) {
      const connectionProvider = resolveConnectionProviderWithGrants(catalog, config);
      if (connectionProvider) {
        providers[config.id] = {
          region: connectionProvider.region,
          endpoint: connectionProvider.endpoint,
          allowsSharing: connectionProvider.allowsSharing,
        };
      }
    }
  }

  const stale = connectionConfigs.filter(
    (config) => !isValidCredentials(sessionData.credentials[config.id]),
  );

  if (stale.length === 0) {
    return { credentials: sessionData.credentials, errors: {}, providers };
  }

  console.info(`${label} Fetching credentials for ${stale.length} connection(s)`);

  const results = await Promise.allSettled(
    stale.map(async (config) => {
      if (!catalog) {
        throw new Error(catalogError ?? "Provider catalog is unavailable.");
      }
      const connectionProvider = resolveConnectionProviderWithGrants(catalog, config);
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
        id: config.id,
        name: config.name,
        credentials: await fetchTemporaryCredentials(
          config,
          grant.roleArn,
          connectionProvider.region,
          connectionProvider.endpoint,
          sessionData.authTokens.idToken,
          roleSessionName,
          sessionData.user.sub,
          grant.accessLevel,
        ),
      };
    }),
  );

  const newCredentials = { ...sessionData.credentials };
  const errors: Record<string, string> = {};
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      newCredentials[result.value.id] = result.value.credentials;
    } else {
      const config = stale[i];
      const reason = describeCredentialError(result.reason);
      errors[config.id] = reason;
      console.warn(`${label} Failed to fetch credentials for ${config.name}: ${reason}`);
    }
  });

  return { credentials: newCredentials, errors, providers };
};
