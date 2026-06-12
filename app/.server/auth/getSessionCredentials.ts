import { AssumeRoleWithWebIdentityCommand, Credentials, STSClient } from "@aws-sdk/client-sts";

import { buildSessionPolicy } from "./sessionPolicy";
import { type ConnectionsCredentials, type SessionData } from "./sessionStorage";
import { ConnectionConfig } from "~/.generated/client";
import { createLabel } from "~/.server/logging";
import { STS_STALENESS_BUFFER_MS } from "~/utils/credentialsRefresh";
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
  idToken: string,
  roleSessionName: string,
): Promise<Credentials> => {
  const { region, endpoint, roleArn, provider, organization, bucketName, prefix } =
    connectionConfig;

  const actualRegion = region ?? "eu-central-1";
  const providerConfig = getS3ProviderConfig(endpoint, actualRegion);

  const stsClient = new STSClient({
    endpoint: providerConfig.stsEndpoint,
    region: actualRegion,
  });

  // Inline session policy is an AWS-specific STS feature: STS intersects it
  // with the role's attached policy, so the minted credential cannot exceed
  // the configured prefix scope even if the role itself is broader.
  // Non-AWS providers (e.g. MinIO) may ignore or reject the `Policy` field,
  // so we omit it there — the role's intrinsic scope is the only bound.
  const sessionPolicy =
    provider === "aws"
      ? buildSessionPolicy({ organization, bucketName, prefix, region: actualRegion })
      : undefined;

  const command = new AssumeRoleWithWebIdentityCommand({
    RoleArn: roleArn ?? undefined,
    RoleSessionName: roleSessionName,
    WebIdentityToken: idToken,
    DurationSeconds: 60 * 60 * 1, // 1 hour
    ...(sessionPolicy ? { Policy: sessionPolicy } : {}),
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

export interface SessionCredentialsResult {
  credentials: ConnectionsCredentials;
  /** Reason string per connection name for connections whose STS mint failed. */
  errors: Record<string, string>;
}

/**
 * Fetches credentials for all connection configs in parallel.
 * Keys credentials by `config.name` so connections that share a bucket but
 * differ in `roleArn` each get their own STS mint. Only fetches for
 * connections with missing or expired credentials.
 */
export const getAllSessionCredentials = async (
  sessionData: SessionData,
  connectionConfigs: ConnectionConfig[],
): Promise<SessionCredentialsResult> => {
  const stale = connectionConfigs.filter(
    (config) => !isValidCredentials(sessionData.credentials[config.name]),
  );

  if (stale.length === 0) {
    return { credentials: sessionData.credentials, errors: {} };
  }

  console.info(`${label} Fetching credentials for ${stale.length} connection(s)`);

  const roleSessionName = sanitizeRoleSessionName(sessionData.user.name);

  // Fetch all in parallel — one failure doesn't block others
  const results = await Promise.allSettled(
    stale.map(async (config) => ({
      name: config.name,
      credentials: await fetchTemporaryCredentials(
        config,
        sessionData.authTokens.idToken,
        roleSessionName,
      ),
    })),
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

  return { credentials: newCredentials, errors };
};
