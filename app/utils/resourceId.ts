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

  const pathName = resourceId.slice(slashIndex + 1).replace(/^\/+/, "");

  if (!connectionName) {
    throw new Error(`Invalid resourceId: "${resourceId}" — empty connectionName`);
  }

  return { connectionName, pathName };
}

/** Returns the file name (last path segment) from a resourceId. */
export function getFileName(resourceId: string): string {
  const { pathName } = parseResourceId(resourceId);
  return pathName.split("/").pop() || pathName;
}

/** Builds a routable URL path from a connection name and an object path. */
export function buildConnectionPath(connectionName: string, pathName: string): string {
  const path = pathName
    ? `/connections/${connectionName}/${pathName}`
    : `/connections/${connectionName}`;
  return path.replace(/\/$/, "");
}

/**
 * Build the HTTPS URL for an S3 bucket or object. Always path-style (dotted
 * bucket names break the vhost wildcard cert). `s3Key` is the full object
 * key including any connection prefix; pass `""` for the bucket-level URL.
 * Callers pass raw keys — path segments are URI-encoded internally.
 */
export function constructS3Url(
  connectionConfig: Pick<ConnectionConfig, "bucketName" | "region" | "endpoint">,
  s3Key: string = "",
): string {
  const bucket = connectionConfig.bucketName;
  const region = connectionConfig.region || "eu-central-1";
  const endpoint = connectionConfig.endpoint?.replace(/\/$/, "");

  const isAwsEndpoint = !endpoint || /\.amazonaws\.com$/i.test(endpoint);
  const origin = isAwsEndpoint ? `https://s3.${region}.amazonaws.com` : endpoint;

  if (!s3Key) {
    return `${origin}/${bucket}`;
  }

  const encodedPath = s3Key.split("/").map(encodeURIComponent).join("/");
  return `${origin}/${bucket}/${encodedPath}`;
}
