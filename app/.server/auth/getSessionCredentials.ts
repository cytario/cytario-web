import { AssumeRoleWithWebIdentityCommand, Credentials, STSClient } from "@aws-sdk/client-sts";

import { buildSessionPolicy } from "./sessionPolicy";
import { type SessionData } from "./sessionStorage";
import { ConnectionConfig } from "~/.generated/client";
import { createLabel } from "~/.server/logging";
import { getS3ProviderConfig } from "~/utils/s3Provider";

const label = createLabel("credentials", "cyan");

/** Per-connection credentials map, keyed by `connectionConfig.name`. */
export type ConnectionsCredentials = Record<string, Credentials>;

export const isValidCredentials = (credentials?: { Expiration?: Date }): boolean => {
  if (!credentials?.Expiration) return false;

  // Check if credentials are expired (with 5 minute buffer)
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return Date.now() < new Date(credentials.Expiration).getTime() - bufferMs;
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
  const { region, endpoint, roleArn, provider, bucketName, prefix } = connectionConfig;

  const actualRegion = region ?? "eu-central-1";
  const providerConfig = getS3ProviderConfig(endpoint, actualRegion);

  try {
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
        ? buildSessionPolicy({ bucketName, prefix, region: actualRegion })
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
  } catch (error) {
    console.error("STS fetchTemporaryCredentials failed:", error);
    throw error;
  }
};

/**
 * Mints fresh STS credentials for every connection config in parallel.
 * Keys credentials by `config.name` so connections that share a bucket but
 * differ in `roleArn` each get their own STS mint.
 *
 * Stateless by design: never reads or writes a credential cache. Callers
 * forward the returned map to the browser, which holds it in memory for the
 * STS lifetime. See `app/utils/signedFetch.ts` for the client-side use.
 */
export const getAllSessionCredentials = async (
  sessionData: SessionData,
  connectionConfigs: ConnectionConfig[],
): Promise<ConnectionsCredentials> => {
  if (connectionConfigs.length === 0) {
    return {};
  }

  const roleSessionName = sanitizeRoleSessionName(sessionData.user.name);

  // Fetch all in parallel — one failure doesn't block others
  const results = await Promise.allSettled(
    connectionConfigs.map(async (config) => ({
      name: config.name,
      credentials: await fetchTemporaryCredentials(
        config,
        sessionData.authTokens.idToken,
        roleSessionName,
      ),
    })),
  );

  const credentials: ConnectionsCredentials = {};
  for (const result of results) {
    if (result.status === "fulfilled") {
      credentials[result.value.name] = result.value.credentials;
    } else {
      console.warn(`${label} Failed to fetch credentials for a connection:`, result.reason);
    }
  }

  return credentials;
};
