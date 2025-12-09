import { S3Client } from "@aws-sdk/client-s3";
import { Credentials } from "@aws-sdk/client-sts";
import { BucketConfig } from "@prisma/client";
import crypto from "crypto";
import { LRUCache } from "lru-cache";

import { isAwsS3Endpoint } from "~/utils/s3Provider";

interface CacheEntry {
  client: S3Client;
  userId: string;
  bucketName: string;
}

/**
 * User-scoped S3Client cache with TTL and LRU eviction.
 * Prevents cross-user data leakage and handles credential expiration.
 */
const s3ClientCache = new LRUCache<string, CacheEntry>({
  max: 10000,
  ttl: 3600000, // 1 hour in milliseconds (matches typical STS credential TTL)
});

/**
 * Creates a unique cache key scoped to user, bucket, and credential identity.
 */
const createCacheKey = (
  userId: string,
  bucketName: string,
  credentials: Credentials
): string => {
  // Hash credentials to detect when they change (e.g., after refresh)
  const credHash = crypto
    .createHash("sha256")
    .update(
      `${credentials.AccessKeyId}:${credentials.SecretAccessKey}:${credentials.SessionToken}`
    )
    .digest("hex")
    .substring(0, 16);

  return `${userId}:${bucketName}:${credHash}`;
};

export const getS3Client = async (
  bucketConfig: BucketConfig,
  credentials: Credentials,
  userId: string
): Promise<S3Client> => {
  const { name: bucketName, region, endpoint } = bucketConfig;
  const { AccessKeyId, SecretAccessKey, SessionToken } = credentials;

  if (!AccessKeyId || !SecretAccessKey) throw Error("No Credentials");
  if (!userId) throw Error("User ID is required for S3Client cache");

  // Check cache first
  const key = createCacheKey(userId, bucketName, credentials);
  const cachedEntry = s3ClientCache.get(key);
  if (cachedEntry) {
    return cachedEntry.client;
  }

  // Use default region if null
  const actualRegion = region ?? "eu-central-1";

  // Detect if this is AWS S3 or a compatible service (MinIO, etc.)
  const isAwsS3 = isAwsS3Endpoint(endpoint);

  const s3Client = new S3Client({
    region: actualRegion,
    // Only set endpoint for non-AWS S3 services
    ...(endpoint && !isAwsS3 ? { endpoint } : {}),
    credentials: {
      accessKeyId: AccessKeyId,
      secretAccessKey: SecretAccessKey,
      sessionToken: SessionToken,
    },
    // Only use path style for non-AWS S3 services (MinIO, etc.)
    forcePathStyle: !isAwsS3,
  });

  // Cache the client
  s3ClientCache.set(key, {
    client: s3Client,
    userId,
    bucketName,
  });

  return s3Client;
};

/**
 * Get cache statistics for monitoring/debugging.
 */
export const getS3ClientCacheStats = () => ({
  size: s3ClientCache.size,
  maxEntries: s3ClientCache.max,
  ttl: s3ClientCache.ttl,
});
