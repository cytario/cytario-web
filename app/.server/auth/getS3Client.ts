import { S3Client } from "@aws-sdk/client-s3";
import { Credentials } from "@aws-sdk/client-sts";
import crypto from "crypto";
import { LRUCache } from "lru-cache";

import { BucketConfig } from "~/.generated/client";
import { createS3ClientOptions } from "~/utils/s3Provider";

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

  if (!userId) throw Error("User ID is required for S3Client cache");

  // Check cache first
  const key = createCacheKey(userId, bucketName, credentials);
  const cachedEntry = s3ClientCache.get(key);
  if (cachedEntry) {
    return cachedEntry.client;
  }

  // Create S3 client using shared configuration
  const options = createS3ClientOptions(credentials, region, endpoint);
  const s3Client = new S3Client(options);

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
