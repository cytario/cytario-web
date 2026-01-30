import {
  AssumeRoleWithWebIdentityCommand,
  Credentials,
  STSClient,
} from "@aws-sdk/client-sts";

import { type SessionData, type SessionCredentials } from "./sessionStorage";
import { BucketConfig } from "~/.generated/client";
import { getBucketConfigByPath } from "~/utils/bucketConfig";
import { getS3ProviderConfig } from "~/utils/s3Provider";

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
 * Retrieves or refreshes session credentials for a specific bucket.
 * @param pathName - The path within the bucket (used to find configs with prefixes)
 * @returns SessionCredentials
 */
export const getSessionCredentials = async (
  sessionData: SessionData,
  provider?: string,
  bucketName?: string,
  pathName?: string,
): Promise<SessionCredentials> => {
  if (!provider || !bucketName) {
    return sessionData.credentials;
  }

  const bucketConfig = await getBucketConfigByPath(
    sessionData.user.sub,
    provider,
    bucketName,
    pathName ?? "",
  );

  if (!bucketConfig) {
    throw new Error(
      `Bucket config not found for bucket: ${provider}/${bucketName}/${pathName ?? ""}`,
    );
  }

  return {
    ...sessionData.credentials,
    [bucketName]: await fetchTemporaryCredentials(
      bucketConfig,
      sessionData.authTokens.idToken,
    ),
  };
};
