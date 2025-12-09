import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BucketConfig } from "@prisma/client";

/**
 * Generate a presigned URL for an object in S3.
 */
export const getPresignedUrl = async (
  bucketConfig: BucketConfig,
  s3Client: S3Client,
  key: string
) => {
  const command = new GetObjectCommand({ Bucket: bucketConfig.name, Key: key });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: 60 * 60 * 1, // 1 hour
  });

  return url;
};
