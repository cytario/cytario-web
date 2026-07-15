import { AssumeRoleWithWebIdentityCommand, Credentials, STSClient } from "@aws-sdk/client-sts";

import { buildSessionPolicy } from "./sessionPolicy";
import { type ConnectionsCredentials, type SessionData } from "./sessionStorage";
import { ConnectionConfig } from "~/.generated/client";
import { createLabel } from "~/.server/logging";
import {
  type ResolvedConnectionProvider,
  getProviderCatalog,
  resolveConnectionProvider,
} from "~/.server/providers/providerCatalog.server";
import { STS_STALENESS_BUFFER_MS } from "~/utils/credentialsRefresh";
import { type ProviderCatalog } from "~/utils/providerCatalog.schema";
import { getS3ProviderConfig } from "~/utils/s3Provider";

const label = createLabel("credentials", "cyan");

export const isValidCredentials = (credentials?: { Expiration?: Date }): boolean => {
  if (!credentials?.Expiration) return false;

  return Date.now() < new Date(credentials.Expiration).getTime() - STS_STALENESS_BUFFER_MS;
};

/**
 * Sanitizes a string for use as an AWS STS RoleSessionName.
 * Allowed characters: [\w+=,.@-]. Collapses consecutive hyphens.
 * Truncates to 64 chars. Falls back to "cytario-session" if result < 2 chars.
 */
export const sanitizeRoleSessionName = (name: string): string => {
  const sanitized = name
    .replace(/[^\w+=,.@-]/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);

  return sanitized.length >= 2 ? sanitized : "cytario-session";
};

const fetchTemporaryCredentials = async (
  connectionConfig: ConnectionConfig,
  resolved: ResolvedConnectionProvider,
  idToken: string,
  roleSessionName: string,
  subject: string,
): Promise<Credentials> => {
  const { organization, bucketName, prefix } = connectionConfig;
  const { region, endpoint, roleArn } = resolved;

  const providerConfig = getS3ProviderConfig(endpoint, region);

  const stsClient = new STSClient({
    endpoint: providerConfig.stsEndpoint,
    region,
  });

  // Inline session policy is an AWS-specific STS feature: STS intersects it
  // with the role's attached policy, so the minted credential cannot exceed
  // the configured prefix scope even if the role itself is broader. It is a
  // closed allowlist that grants no `s3:PutBucketPolicy`.
  // S3-compatible providers whose STS ignores/rejects `Policy` (notably MinIO,
  // signalled by a non-AWS endpoint) omit it — the role's attached policy is
  // then the only bound.
  const Policy = providerConfig.isAwsS3
    ? buildSessionPolicy({ organization, bucketName, prefix, region, subject })
    : undefined;

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

/** Map an STS error to a single-line human-readable reason. */
const describeCredentialError = (error: unknown): string => {
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
  connectionConfigs: ConnectionConfig[],
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
      const resolved = resolveConnectionProvider(catalog, config);
      if (resolved) {
        providers[config.name] = {
          region: resolved.region,
          endpoint: resolved.endpoint,
          allowsSharing: resolved.allowsSharing,
        };
      }
    }
  }

  const stale = connectionConfigs.filter(
    (config) => !isValidCredentials(sessionData.credentials[config.name]),
  );

  if (stale.length === 0) {
    return { credentials: sessionData.credentials, errors: {}, providers };
  }

  console.info(`${label} Fetching credentials for ${stale.length} connection(s)`);

  // Fetch all in parallel — one failure doesn't block others
  const results = await Promise.allSettled(
    stale.map(async (config) => {
      if (!catalog) {
        throw new Error(catalogError ?? "Provider catalog is unavailable.");
      }
      const resolved = resolveConnectionProvider(catalog, config);
      if (!resolved) {
        throw new Error(
          "This connection references a provider connection or role that is no longer available. Ask an administrator to check the storage onboarding.",
        );
      }
      return {
        name: config.name,
        credentials: await fetchTemporaryCredentials(
          config,
          resolved,
          sessionData.authTokens.idToken,
          roleSessionName,
          sessionData.user.sub,
        ),
      };
    }),
  );

  const newCredentials = { ...sessionData.credentials };
  const errors: Record<string, string> = {};
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      newCredentials[result.value.name] = result.value.credentials;
    } else {
      const name = stale[i].name;
      const reason = describeCredentialError(result.reason);
      errors[name] = reason;
      console.warn(`${label} Failed to fetch credentials for ${name}: ${reason}`);
    }
  });

  return { credentials: newCredentials, errors, providers };
};
