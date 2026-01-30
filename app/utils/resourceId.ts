export interface ResourceIdParts {
  provider: string;
  bucketName: string;
  pathName: string;
}

export function createResourceId(
  provider: string,
  bucketName: string,
  pathName = "",
): string {
  return `${provider}/${bucketName}/${pathName}`;
}

/**
 * Parses a resourceId into its constituent parts
 * @param resourceId - The composite identifier (format: provider/bucketName/pathName)
 * @returns Object with provider, bucketName and pathName
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

export const getBucketFromResourceId = (resourceId: string): string =>
  parseResourceId(resourceId).bucketName;

export const getPathFromResourceId = (resourceId: string): string =>
  parseResourceId(resourceId).pathName;

export const getProviderFromResourceId = (resourceId: string): string =>
  parseResourceId(resourceId).provider;

/**
 * Converts a resourceId to an S3 URI
 * @param resourceId - The composite identifier
 * @returns S3 URI in format "s3://bucketName/pathName"
 */
export function toS3Uri(resourceId: string): string {
  const { bucketName, pathName } = parseResourceId(resourceId);
  return `s3://${bucketName}/${pathName}`;
}

/**
 * Gets the file name from a resourceId
 * @param resourceId - The composite identifier
 * @returns The file name (last segment of path)
 */
export function getFileName(resourceId: string): string {
  const { pathName } = parseResourceId(resourceId);
  return pathName.split("/").pop() || pathName;
}

/**
 * Checks file extension against a pattern
 * @param resourceId - The composite identifier
 * @param pattern - RegExp to match against (e.g., /\.(tif|tiff)$/i)
 * @returns True if the file extension matches
 */
export function matchesExtension(resourceId: string, pattern: RegExp): boolean {
  return pattern.test(resourceId);
}
