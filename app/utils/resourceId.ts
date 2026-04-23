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
export function buildConnectionPath(connectionName: string, pathName: string): string {
  const path = pathName
    ? `/connections/${connectionName}/${pathName}`
    : `/connections/${connectionName}`;
  return path.replace(/\/$/, "");
}

/**
 * Builds the HTTPS URL for a connection-root-relative `pathName` by rejoining
 * the configured prefix and delegating to `constructS3Url`. Use this when
 * you already have a `ConnectionConfig` in hand (e.g. from a loader) and
 * don't want to round-trip through the store.
 *
 * For reactive use inside components, prefer `selectHttpsUrl(resourceId)`
 * — it reads from the Zustand store and keeps in sync with state changes.
 *
 * @example
 * buildHttpsUrl({ bucketName: "b", prefix: "data" }, "file.tif")
 * // → "https://b.s3.eu-central-1.amazonaws.com/data/file.tif"
 */
export function buildHttpsUrl(
  connectionConfig: Pick<
    ConnectionConfig,
    "bucketName" | "region" | "endpoint" | "prefix"
  >,
  pathName: string,
): string {
  const prefix = connectionConfig.prefix?.replace(/\/$/, "");
  const s3Key = prefix ? `${prefix}/${pathName}` : pathName;
  return constructS3Url(connectionConfig, s3Key);
}

/**
 * Builds the HTTPS URL for a full S3 object key. Uses virtual-hosted style
 * for AWS S3, falls back to path-style for dotted bucket names (TLS wildcard
 * cert limitation), and uses path-style for custom endpoints (MinIO, R2).
 * Path segments are URI-encoded — callers pass raw keys.
 *
 * The `s3Key` is the **full object key including any connection prefix**.
 * If you have a prefix-relative `pathName`, use `buildHttpsUrl` instead to
 * have the prefix rejoined for you.
 *
 * @example
 * // AWS virtual-hosted:
 * constructS3Url({ bucketName: "my-bucket", region: "eu-central-1" }, "data/image.ome.tif")
 * // → "https://my-bucket.s3.eu-central-1.amazonaws.com/data/image.ome.tif"
 *
 * @example
 * // Dotted bucket (path-style fallback):
 * constructS3Url({ bucketName: "my.bucket", region: "us-east-1" }, "file.txt")
 * // → "https://s3.us-east-1.amazonaws.com/my.bucket/file.txt"
 *
 * @example
 * // MinIO / R2 custom endpoint:
 * constructS3Url({ bucketName: "b", endpoint: "http://localhost:9000" }, "x.zarr")
 * // → "http://localhost:9000/b/x.zarr"
 */
export function constructS3Url(
  connectionConfig: Pick<ConnectionConfig, "bucketName" | "region" | "endpoint">,
  s3Key: string,
): string {
  const bucket = connectionConfig.bucketName;
  const encodedPath = s3Key
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  const region = connectionConfig.region || "eu-central-1";
  const endpoint = connectionConfig.endpoint?.replace(/\/$/, "");

  const isAwsEndpoint = !endpoint || /\.amazonaws\.com$/i.test(endpoint);

  if (isAwsEndpoint) {
    // Dotted bucket names break the wildcard cert `*.s3.<region>.amazonaws.com`
    // (wildcards match a single DNS label). AWS SDK v3 does the same fallback.
    if (bucket.includes(".")) {
      return `https://s3.${region}.amazonaws.com/${bucket}/${encodedPath}`;
    }
    return `https://${bucket}.s3.${region}.amazonaws.com/${encodedPath}`;
  }

  return `${endpoint}/${bucket}/${encodedPath}`;
}
