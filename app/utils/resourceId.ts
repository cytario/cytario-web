export interface ResourceIdParts {
  provider: string;
  bucketName: string;
  pathName: string;
}

/**
 * Ensures a path ends with a trailing slash for use as an S3 prefix.
 * @param path - The path to convert to a prefix
 * @returns The path with a trailing slash, or undefined if path is empty
 */
export function getPrefix(path: string): string | undefined {
  if (!path) return undefined;
  if (path.endsWith("/")) return path;
  return path + "/";
}

export function createResourceId(
  provider: string,
  bucketName: string,
  pathName = ""
): string {
  return `${provider}/${bucketName}/${pathName}`;
}

/**
 *
 */
type ResourceId = string;

function getExtension(resourceId: ResourceId) {
  if (resourceId.endsWith(".ome.tif")) return "ome.tif";
  if (resourceId.endsWith(".zarr")) return "zarr";
  if (resourceId.endsWith(".parquet")) return "parquet";
  if (resourceId.endsWith(".csv")) return "csv";
  return undefined;
}

export function parseResourceId(resourceId: ResourceId): ResourceIdParts {
  const [provider, bucketName, ...pathSegments] = resourceId.split("/");
  const pathName = pathSegments.join("/");
  return { provider, bucketName, pathName };
}

/**
 * Extracts the bucket key (provider/bucketName) from a resourceId
 * @param resourceId - The composite identifier
 * @returns The bucket key portion (provider/bucketName)
 */
export function getBucketKeyFromResourceId(resourceId: string): string {
  const { provider, bucketName } = parseResourceId(resourceId);
  return `${provider}/${bucketName}`;
}

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
 * Checks if a string is a valid resourceId format (provider/bucketName/pathName)
 * @param value - String to check
 * @returns True if the string has format provider/bucketName/pathName with non-empty provider and bucketName
 */
export function isValidResourceId(value: string): boolean {
  const firstSlash = value.indexOf("/");
  const secondSlash = value.indexOf("/", firstSlash + 1);
  // Must have two slashes, with non-empty provider and bucketName
  return firstSlash > 0 && secondSlash > firstSlash + 1;
}

/**
 * Gets the file/folder name from a resourceId (last segment of path)
 * @param resourceId - The composite identifier
 * @returns The name (last segment), or empty string if path is empty
 */
export function getFileName(resourceId: string): string {
  const { pathName } = parseResourceId(resourceId);
  // Strip trailing slashes to handle directory paths correctly
  const normalized = pathName.replace(/\/+$/, "");
  return normalized.split("/").pop() || "";
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
