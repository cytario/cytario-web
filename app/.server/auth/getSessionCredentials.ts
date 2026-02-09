import {
  AssumeRoleWithWebIdentityCommand,
  Credentials,
  STSClient,
} from "@aws-sdk/client-sts";

import { type SessionData, type SessionCredentials } from "./sessionStorage";
import { BucketConfig } from "~/.generated/client";
import { createLabel } from "~/.server/logging";
import { getS3ProviderConfig } from "~/utils/s3Provider";

const label = createLabel("credentials", "cyan");

export const isValidCredentials = (
  credentials?: { Expiration?: Date },
): boolean => {
  if (!credentials?.Expiration) return false;

  // Check if credentials are expired (with 5 minute buffer)
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return Date.now() < new Date(credentials.Expiration).getTime() - bufferMs;
};

const fetchTemporaryCredentials = async (
  bucketConfig: BucketConfig,
  idToken: string,
): Promise<Credentials> => {
  const { region, endpoint, roleArn } = bucketConfig;

  const actualRegion = region ?? "eu-central-1";
  const providerConfig = getS3ProviderConfig(endpoint, actualRegion);

  try {
    const stsClient = new STSClient({
      endpoint: providerConfig.stsEndpoint,
      region: actualRegion,
    });

    const command = new AssumeRoleWithWebIdentityCommand({
      RoleArn: roleArn ?? undefined,
      RoleSessionName: "test-web-identity-session",
      WebIdentityToken: idToken,
      DurationSeconds: 60 * 60 * 1, // 1 hour
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
 * Fetches credentials for all bucket configs in parallel.
 * Deduplicates by bucket name (multiple prefix configs share STS credentials).
 * Only fetches for buckets with missing or expired credentials.
 */
export const getAllSessionCredentials = async (
  sessionData: SessionData,
  bucketConfigs: BucketConfig[],
): Promise<SessionCredentials> => {
  // Deduplicate: one STS call per unique bucket name
  const uniqueBuckets = new Map<string, BucketConfig>();
  for (const config of bucketConfigs) {
    if (!uniqueBuckets.has(config.name)) {
      uniqueBuckets.set(config.name, config);
    }
  }

  // Filter to only buckets needing credential refresh
  const bucketsNeedingCredentials = Array.from(uniqueBuckets.entries()).filter(
    ([name]) => !isValidCredentials(sessionData.credentials[name]),
  );

  if (bucketsNeedingCredentials.length === 0) {
    return sessionData.credentials;
  }

  console.info(
    `${label} Fetching credentials for ${bucketsNeedingCredentials.length} bucket(s)`,
  );

  // Fetch all in parallel — one failure doesn't block others
  const results = await Promise.allSettled(
    bucketsNeedingCredentials.map(async ([name, config]) => ({
      name,
      credentials: await fetchTemporaryCredentials(
        config,
        sessionData.authTokens.idToken,
      ),
    })),
  );

  const newCredentials = { ...sessionData.credentials };
  for (const result of results) {
    if (result.status === "fulfilled") {
      newCredentials[result.value.name] = result.value.credentials;
    } else {
      console.warn(
        `${label} Failed to fetch credentials for a bucket:`,
        result.reason,
      );
    }
  }

  return newCredentials;
};
