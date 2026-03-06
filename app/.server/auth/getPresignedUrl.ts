import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { ConnectionConfig } from "~/.generated/client";

/**
 * Generate a presigned URL for an object in S3.
 */
export const getPresignedUrl = async (
  connectionConfig: ConnectionConfig,
  s3Client: S3Client,
  key: string,
) => {
  const command = new GetObjectCommand({ Bucket: connectionConfig.name, Key: key });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: 60 * 60 * 1, // 1 hour
  });

  return url;
};
