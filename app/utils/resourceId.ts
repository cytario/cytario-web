import { getExtension } from "./fileType";
import type { ConnectionConfig } from "~/.generated/client";

export interface ResourceIdParts {
  connectionName: string;
  pathName: string;
  /** Last path segment, with extension — e.g. `"USL-2024-58461-31.ome.tif"`. Empty for bucket-level ids. */
  fileName: string;
  /** File name without its (compound) extension — e.g. `"USL-2024-58461-31"`. */
  name: string;
  /** Compound-aware extension (e.g. `"ome.tif"`), or `undefined` for directories/buckets. */
  extension: string | undefined;
}

/**
 * Parses a resourceId (`connectionName/pathName`) into its parts, including the
 * file name, base name, and (compound-aware) extension of the last segment.
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
  if (!connectionName) {
    throw new Error(`Invalid resourceId: "${resourceId}" — empty connectionName`);
  }

  const pathName = resourceId.slice(slashIndex + 1).replace(/^\/+/, "");
  const fileName = pathName.replace(/\/+$/, "").split("/").pop() ?? "";
  const extension = getExtension(fileName);
  const name = extension ? fileName.slice(0, -(extension.length + 1)) : fileName;

  return { connectionName, pathName, fileName, name, extension };
}

/**
 * Ancestor directory node ids for a resource, from the connection root down to
 * the folder that contains it (the resource itself is excluded). Ids match
 * `DirectoryViewTree` node ids — `connectionName/pathName` with a trailing
 * slash on directories — so the result can be passed as `defaultExpandedItems`
 * to reveal a deep-linked node in the sidebar tree.
 *
 * `pathName` must be decoded (S3-key form, e.g. `customers/Project 6712/x.tif`).
 */
export function ancestorDirIds(connectionName: string, pathName: string): string[] {
  const ids = [`${connectionName}/`];
  // Drop the trailing segment: it's the resource being viewed, not a parent to expand.
  const segments = pathName.replace(/\/+$/, "").split("/").filter(Boolean);
  segments.pop();
  let acc = "";
  for (const segment of segments) {
    acc += `${segment}/`;
    ids.push(`${connectionName}/${acc}`);
  }
  return ids;
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
