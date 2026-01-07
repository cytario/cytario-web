import { _Object } from "@aws-sdk/client-s3";

import { BucketConfig } from "~/.generated/client";
import { IndexEntry } from "~/components/DirectoryView/queryIndex";

export type TreeNode = {
  type: "bucket" | "directory" | "file";
  name: string;
  bucketName: string;
  pathName?: string;
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
 */
function buildTreeRecursive(
  currentDir: TreeNode[],
  keyParts: string[],
  source: TreeNodeSource,
  bucketName: string,
  parentPath: string = "",
  bucketConfig?: BucketConfig
) {
  const name = keyParts[0];
  let pathName = parentPath + name;
  if (keyParts.length > 1) pathName += "/";

  const objectData: _Object = {
    Key: source.key,
    Size: source.size,
    LastModified: source.lastModified,
    ETag: source.etag ?? undefined,
  };

  if (keyParts.length === 1) {
    currentDir.push({
      type: "file",
      name,
      pathName,
      bucketName,
      children: [],
      _Object: objectData,
      _Bucket: bucketConfig,
    });
  } else {
    let existingDir = currentDir.find((child) => child.name === name);
    if (!existingDir) {
      existingDir = {
        type: "directory",
        name,
        pathName,
        bucketName,
        children: [],
        _Object: objectData,
        _Bucket: bucketConfig,
      };
      currentDir.push(existingDir);
    }

    buildTreeRecursive(
      existingDir.children,
      keyParts.slice(1),
      source,
      bucketName,
      pathName,
      bucketConfig
    );
  }
}

/**
 * Generic tree builder that accepts any source type with a mapper function.
 */
function buildTreeFromSources<T>(
  bucketName: string,
  sources: T[],
  prefix: string | undefined,
  getSource: (item: T) => TreeNodeSource,
  bucketConfig?: BucketConfig
): TreeNode[] {
  const root: TreeNode[] = [];

  sources.forEach((item) => {
    const source = getSource(item);
    if (!source.key) return;

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
      bucketName,
      prefix,
      bucketConfig
    );
  });

  return root;
}

/**
 * Build directory tree from S3 objects (SSR path)
 */
export function buildDirectoryTree(
  bucketName: string,
  objects: _Object[],
  prefix?: string,
  bucketConfig?: BucketConfig
): TreeNode[] {
  return buildTreeFromSources(
    bucketName,
    objects,
    prefix,
    (obj) => ({
      key: obj.Key ?? "",
      size: obj.Size ?? 0,
      lastModified: obj.LastModified ?? new Date(),
      etag: obj.ETag,
    }),
    bucketConfig
  );
}

/**
 * Build directory tree from DuckDB index entries
 * Used by clientLoader for instant navigation when index is available
 */
export function buildDirectoryTreeFromIndex(
  bucketName: string,
  entries: IndexEntry[],
  prefix?: string
): TreeNode[] {
  return buildTreeFromSources(bucketName, entries, prefix, (entry) => ({
    key: entry.key,
    size: entry.size,
    lastModified: entry.lastModified,
    etag: entry.etag,
  }));
}
