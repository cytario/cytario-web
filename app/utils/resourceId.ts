import { getExtension } from "./fileType";

export interface ResourceIdParts {
  connectionId: string;
  pathName: string;
  /** Last path segment, with extension — e.g. `"USL-2024-58461-31.ome.tif"`. Empty for bucket-level ids. */
  fileName: string;
  /** File name without its (compound) extension — e.g. `"USL-2024-58461-31"`. */
  name: string;
  /** Compound-aware extension (e.g. `"ome.tif"`), or `undefined` for directories/buckets. */
  extension: string | undefined;
}

/**
 * Parses a resourceId (`connectionId/pathName`) into its parts, including the
 * file name, base name, and (compound-aware) extension of the last segment.
 * @throws Error if resourceId is malformed
 */
export function parseResourceId(resourceId: string): ResourceIdParts {
  const slashIndex = resourceId.indexOf("/");
  if (slashIndex === -1) {
    throw new Error(`Invalid resourceId: "${resourceId}" — expected format connectionId/pathName`);
  }

  const connectionId = resourceId.slice(0, slashIndex);
  if (!connectionId) {
    throw new Error(`Invalid resourceId: "${resourceId}" — empty connectionId`);
  }

  const pathName = resourceId.slice(slashIndex + 1).replace(/^\/+/, "");
  const fileName = pathName.replace(/\/+$/, "").split("/").pop() ?? "";
  const extension = getExtension(fileName);
  const name = extension ? fileName.slice(0, -(extension.length + 1)) : fileName;

  return { connectionId, pathName, fileName, name, extension };
}

/** Builds a routable URL path from a connection id and an object path. */
export function buildConnectionPath(connectionId: string, pathName: string): string {
  const path = pathName
    ? `/connections/${connectionId}/${pathName}`
    : `/connections/${connectionId}`;
  return path.replace(/\/$/, "");
}

/**
 * The bucket-address inputs `constructS3Url` needs: the bucket name plus the
 * non-secret region / endpoint resolved from the connection's provider connection
 * in the catalog, no longer stored on the connection record.
 */
export interface BucketAddress {
  bucketName: string;
  region?: string | null;
  endpoint?: string | null;
}

/**
 * Build the HTTPS URL for an S3 bucket or object. Always path-style (dotted
 * bucket names break the vhost wildcard cert). `s3Key` is the full object
 * key including any connection prefix; pass `""` for the bucket-level URL.
 * Callers pass raw keys — path segments are URI-encoded internally.
 */
export function constructS3Url(address: BucketAddress, s3Key: string = ""): string {
  const bucket = address.bucketName;
  const region = address.region || "eu-central-1";
  const endpoint = address.endpoint?.replace(/\/$/, "");

  const isAwsEndpoint = !endpoint || /\.amazonaws\.com$/i.test(endpoint);
  const origin = isAwsEndpoint ? `https://s3.${region}.amazonaws.com` : endpoint;

  if (!s3Key) {
    return `${origin}/${bucket}`;
  }

  const encodedPath = s3Key.split("/").map(encodeURIComponent).join("/");
  return `${origin}/${bucket}/${encodedPath}`;
}
