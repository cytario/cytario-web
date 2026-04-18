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
  const pathName = resourceId.slice(slashIndex + 1);

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
