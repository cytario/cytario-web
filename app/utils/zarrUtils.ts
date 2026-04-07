import type { ConnectionConfig } from "~/.generated/client";

/**
 * Check if a URL or path points to a zarr image.
 * Matches paths containing .zarr as a complete extension segment
 * (followed by /, end of string, or query parameter).
 */
export function isZarrPath(urlOrPath: string): boolean {
  return /\.zarr(\/|$|\?)/.test(urlOrPath);
}

/**
 * Construct a direct S3 URL from connection config and path.
 * Uses virtual-hosted style for AWS S3 and path-style for custom endpoints.
 * Path segments are URI-encoded to handle special characters in S3 keys.
 */
export function constructS3Url(
  connectionConfig: Pick<ConnectionConfig, "bucketName" | "region" | "endpoint">,
  pathName: string,
): string {
  const bucket = connectionConfig.bucketName;
  const encodedPath = pathName
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  const region = connectionConfig.region || "eu-central-1";
  const endpoint = connectionConfig.endpoint?.replace(/\/$/, "");

  // Detect AWS S3 endpoints — use virtual-hosted style (bucket.s3.region.amazonaws.com)
  // regardless of whether the endpoint is explicit or implicit.
  const isAwsEndpoint = !endpoint || /\.amazonaws\.com$/i.test(endpoint);

  if (isAwsEndpoint) {
    return `https://${bucket}.s3.${region}.amazonaws.com/${encodedPath}`;
  }

  // Custom endpoints (MinIO, R2, etc.) — use path-style
  return `${endpoint}/${bucket}/${encodedPath}`;
}
