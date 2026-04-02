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
 * Construct an S3 URL from connection config and path.
 * Used for zarr files that need direct S3 access with credentials.
 */
export function constructS3Url(
  connectionConfig: Pick<ConnectionConfig, "bucketName" | "region" | "endpoint">,
  pathName: string,
): string {
  const bucket = connectionConfig.bucketName;

  // Handle custom endpoints (MinIO, R2, etc.)
  if (connectionConfig.endpoint) {
    const endpoint = connectionConfig.endpoint.replace(/\/$/, "");
    return `${endpoint}/${bucket}/${pathName}`;
  }

  // Default to AWS S3 virtual-hosted style URL
  const region = connectionConfig.region || "us-east-1";
  return `https://${bucket}.s3.${region}.amazonaws.com/${pathName}`;
}
