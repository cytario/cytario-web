import type { ConnectionConfig } from "~/.generated/client";

export interface ResourceIdParts {
  connectionName: string;
  pathName: string;
}

/**
 * Parses a resourceId (`connectionName/pathName`) into its parts.
 * @throws Error if resourceId is malformed
 */
export function parseResourceId(resourceId: string): ResourceIdParts {
  const slashIndex = resourceId.indexOf("/");
  if (slashIndex === -1) {
    throw new Error(
      `Invalid resourceId: "${resourceId}" — expected format connectionName/pathName`,
    );
  }

  const connectionName = resourceId.slice(0, slashIndex);

  const pathName = resourceId
    .slice(slashIndex + 1)
    // Strip leading slash
    .replace(/^\/+/, "");

  if (!connectionName) {
    throw new Error(
      `Invalid resourceId: "${resourceId}" — empty connectionName`,
    );
  }

  return { connectionName, pathName };
}

/** Returns the file name (last path segment) from a resourceId. */
export function getFileName(resourceId: string): string {
  const { pathName } = parseResourceId(resourceId);
  return pathName.split("/").pop() || pathName;
}

/**
 * Returns the S3 key for a connection's Parquet index file.
 * Empty prefix -> ".cytario/index.parquet"
 * With prefix  -> "<prefix>/.cytario/index.parquet"
 */
export function toIndexS3Key(prefix = ""): string {
  const normalized = prefix.replace(/\/$/, "");
  return normalized
    ? `${normalized}/.cytario/index.parquet`
    : ".cytario/index.parquet";
}

/** Builds a routable URL path from a connection name and an object path. */
export function buildConnectionPath(
  connectionName: string,
  pathName: string,
): string {
  const path = pathName
    ? `/connections/${connectionName}/${pathName}`
    : `/connections/${connectionName}`;
  return path.replace(/\/$/, "");
}

/**
 * Builds the HTTPS URL for a full S3 object key. Always path-style — works
 * for every bucket shape (including dotted names, which break the vhost
 * wildcard cert) and keeps a single URL form across AWS and S3-compatible
 * endpoints. Path segments are URI-encoded — callers pass raw keys.
 *
 * The `s3Key` is the **full object key including any connection prefix**.
 * If you have a prefix-relative `pathName` and a resourceId, use
 * `selectHttpsUrl` / `resolveResourceId` — they rejoin the prefix for you.
 *
 * @example
 * // AWS:
 * constructS3Url({ bucketName: "my-bucket", region: "eu-central-1" }, "data/image.ome.tif")
 * // → "https://s3.eu-central-1.amazonaws.com/my-bucket/data/image.ome.tif"
 *
 * @example
 * // MinIO / R2 custom endpoint:
 * constructS3Url({ bucketName: "b", endpoint: "http://localhost:9000" }, "x.zarr")
 * // → "http://localhost:9000/b/x.zarr"
 */
export function constructS3Url(
  connectionConfig: ConnectionConfig,
  s3Key: string,
): string {
  const bucket = connectionConfig.bucketName;
  const encodedPath = s3Key.split("/").map(encodeURIComponent).join("/");

  const region = connectionConfig.region || "eu-central-1";
  const endpoint = connectionConfig.endpoint?.replace(/\/$/, "");

  const isAwsEndpoint = !endpoint || /\.amazonaws\.com$/i.test(endpoint);

  // TODO: Check if this can be fixed on db-level
  if (isAwsEndpoint) {
    return `https://s3.${region}.amazonaws.com/${bucket}/${encodedPath}`;
  }

  return `${endpoint}/${bucket}/${encodedPath}`;
}
