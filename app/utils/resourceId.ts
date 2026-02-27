export interface ResourceIdParts {
  provider: string;
  bucketName: string;
  pathName: string;
}

/**
 * Creates a composite resource identifier for an S3 object.
 * Format: "provider/bucketName/pathName"
 */
export function createResourceId(
  provider: string,
  bucketName: string,
  pathName = "",
): string {
  return `${provider}/${bucketName}/${pathName}`;
}

/**
 * Creates a connection key for a BucketConfig, used as the Zustand store key.
 * Unlike createResourceId, the empty-prefix form omits the trailing slash so
 * it stays compatible with existing "provider/bucketName" store entries.
 * Format: "provider/bucketName" (no prefix) or "provider/bucketName/prefix" (with prefix).
 */
export function createConnectionKey(
  provider: string,
  bucketName: string,
  prefix = "",
): string {
  const normalized = prefix.replace(/\/$/, "");
  return normalized
    ? `${provider}/${bucketName}/${normalized}`
    : `${provider}/${bucketName}`;
}

/**
 * Parses a resourceId into its constituent parts.
 * @throws Error if resourceId is malformed
 */
export function parseResourceId(resourceId: string): ResourceIdParts {
  const firstSlashIndex = resourceId.indexOf("/");
  const secondSlashIndex = resourceId.indexOf("/", firstSlashIndex + 1);

  if (firstSlashIndex === -1 || secondSlashIndex === -1) {
    throw new Error(
      `Invalid resourceId: "${resourceId}" - expected format provider/bucketName/pathName`,
    );
  }

  const provider = resourceId.slice(0, firstSlashIndex);
  const bucketName = resourceId.slice(firstSlashIndex + 1, secondSlashIndex);
  const pathName = resourceId.slice(secondSlashIndex + 1);

  if (!provider) {
    throw new Error(`Invalid resourceId: "${resourceId}" - empty provider`);
  }

  if (!bucketName) {
    throw new Error(`Invalid resourceId: "${resourceId}" - empty bucket name`);
  }

  return { provider, bucketName, pathName };
}

/** Extracts the bucket name from a resourceId. */
export const getBucketFromResourceId = (resourceId: string): string =>
  parseResourceId(resourceId).bucketName;

/** Extracts the path name from a resourceId. */
export const getPathFromResourceId = (resourceId: string): string =>
  parseResourceId(resourceId).pathName;

/** Extracts the provider from a resourceId. */
export const getProviderFromResourceId = (resourceId: string): string =>
  parseResourceId(resourceId).provider;

/**
 * Converts a resourceId to an S3 URI.
 * Format: "s3://bucketName/pathName"
 */
export function toS3Uri(resourceId: string): string {
  const { bucketName, pathName } = parseResourceId(resourceId);
  return `s3://${bucketName}/${pathName}`;
}

/**
 * Returns the S3 key for a connection's Parquet index file.
 * Empty prefix → ".cytario/index.parquet"
 * With prefix  → "<prefix>/.cytario/index.parquet"
 */
export function toIndexS3Key(prefix = ""): string {
  const normalized = prefix.replace(/\/$/, "");
  return normalized
    ? `${normalized}/.cytario/index.parquet`
    : ".cytario/index.parquet";
}

/** Returns the file name (last path segment) from a resourceId. */
export function getFileName(resourceId: string): string {
  const { pathName } = parseResourceId(resourceId);
  return pathName.split("/").pop() || pathName;
}

/** Returns true if the resourceId's path matches the given extension pattern. */
export function matchesExtension(resourceId: string, pattern: RegExp): boolean {
  return pattern.test(resourceId);
}
