import { _Object } from "@aws-sdk/client-s3";

import { BucketConfig } from "~/.generated/client";
import { IndexEntry } from "~/components/DirectoryView/queryIndex";

export type TreeNodeType = "bucket" | "directory" | "file";
export type TreeNode = {
  id: string; // Full resourceId: "provider/bucket/path"
  type: TreeNodeType;
  name: string;
  children: TreeNode[];
  _Object?: _Object;
  _Bucket?: BucketConfig;
};

/**
 * Source data for building tree nodes.
 * Used to normalize ObjectPresignedUrl and IndexEntry into a common format.
 */
interface TreeNodeSource {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string | null;
}

/**
 * Generic recursive tree builder that works with any source type.
 * @param bucketKey - The bucket key in format "provider/bucketName"
 * @param parentPath - The accumulated path within the bucket (with trailing slash if non-empty)
 */
function buildTreeRecursive(
  currentDir: TreeNode[],
  keyParts: string[],
  source: TreeNodeSource,
  bucketKey: string,
  parentPath: string = "",
  isDirectory?: boolean
) {
  const name = keyParts[0];
  // Build path within bucket (no trailing slash)
  const pathWithinBucket = parentPath ? `${parentPath}${name}` : name;
  // Build full resourceId
  const id = `${bucketKey}/${pathWithinBucket}`;

  const objectData: _Object = {
    Key: source.key,
    Size: source.size,
    LastModified: source.lastModified,
    ETag: source.etag ?? undefined,
  };

  if (keyParts.length === 1) {
    currentDir.push({
      id,
      type: isDirectory ? "directory" : "file",
      name,
      children: [],
      _Object: objectData,
    });
  } else {
    let existingDir = currentDir.find((child) => child.name === name);
    if (!existingDir) {
      existingDir = {
        id,
        type: "directory",
        name,
        children: [],
        _Object: objectData,
      };
      currentDir.push(existingDir);
    }

    buildTreeRecursive(
      existingDir.children,
      keyParts.slice(1),
      source,
      bucketKey,
      `${pathWithinBucket}/`, // Add trailing slash for next level's parentPath
      isDirectory
    );
  }
}

/**
 * Generic tree builder that accepts any source type with a mapper function.
 * @param bucketKey - The bucket key in format "provider/bucketName"
 */
function buildTreeFromSources<T>(
  bucketKey: string,
  sources: T[],
  prefix: string | undefined,
  getSource: (item: T) => TreeNodeSource
): TreeNode[] {
  const root: TreeNode[] = [];

  sources.forEach((item) => {
    const source = getSource(item);
    if (!source.key) return;

    // S3 directory markers end with "/", preserve this info before filtering
    const isDirectory = source.key.endsWith("/");

    const pathName = source.key.replace(prefix || "", "");
    // Skip if this is the prefix itself (empty after removal)
    if (!pathName) return;

    // Filter empty segments to handle trailing slashes consistently
    const pathSegments = pathName.split("/").filter(Boolean);
    if (pathSegments.length === 0) return;

    buildTreeRecursive(
      root,
      pathSegments,
      source,
      bucketKey,
      prefix,
      isDirectory
    );
  });

  return root;
}

/**
 * Build directory tree from S3 objects (SSR path)
 * @param bucketKey - The bucket key in format "provider/bucketName"
 */
export function buildDirectoryTree(
  bucketKey: string,
  objects: _Object[],
  prefix?: string
): TreeNode[] {
  // Filter out S3 directory markers (empty objects ending with /)
  const files = objects.filter(
    (obj) => !(obj.Key?.endsWith("/") && obj.Size === 0)
  );
  return buildTreeFromSources(bucketKey, files, prefix, (obj) => ({
    key: obj.Key ?? "",
    size: obj.Size ?? 0,
    lastModified: obj.LastModified ?? new Date(),
    etag: obj.ETag,
  }));
}

/**
 * Build directory tree from DuckDB index entries
 * Used by clientLoader for instant navigation when index is available
 * @param bucketKey - The bucket key in format "provider/bucketName"
 */
export function buildDirectoryTreeFromIndex(
  bucketKey: string,
  entries: IndexEntry[],
  prefix?: string
): TreeNode[] {
  return buildTreeFromSources(bucketKey, entries, prefix, (entry) => ({
    key: entry.key,
    size: entry.size,
    lastModified: entry.lastModified,
    etag: entry.etag,
  }));
}
