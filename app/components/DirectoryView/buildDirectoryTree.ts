import { _Object } from "@aws-sdk/client-s3";

import { BucketConfig } from "~/.generated/client";

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
 * Recursive tree builder that processes S3 objects into a tree structure.
 * @param bucketKey - The bucket key in format "provider/bucketName"
 * @param parentPath - The accumulated path within the bucket (with trailing slash if non-empty)
 */
function buildTreeRecursive(
  currentDir: TreeNode[],
  keyParts: string[],
  obj: _Object,
  bucketKey: string,
  parentPath: string = "",
  isDirectory?: boolean
) {
  const name = keyParts[0];
  // Build path within bucket (no trailing slash)
  const pathWithinBucket = parentPath ? `${parentPath}${name}` : name;
  // Build full resourceId
  const id = `${bucketKey}/${pathWithinBucket}`;

  if (keyParts.length === 1) {
    currentDir.push({
      id,
      type: isDirectory ? "directory" : "file",
      name,
      children: [],
      _Object: obj,
    });
  } else {
    let existingDir = currentDir.find((child) => child.name === name);
    if (!existingDir) {
      existingDir = {
        id,
        type: "directory",
        name,
        children: [],
        _Object: obj,
      };
      currentDir.push(existingDir);
    }

    buildTreeRecursive(
      existingDir.children,
      keyParts.slice(1),
      obj,
      bucketKey,
      `${pathWithinBucket}/`, // Add trailing slash for next level's parentPath
      isDirectory
    );
  }
}

/**
 * Build tree from S3 objects.
 * @param bucketKey - The bucket key in format "provider/bucketName"
 */
function buildTree(
  bucketKey: string,
  objects: _Object[],
  prefix: string | undefined
): TreeNode[] {
  const root: TreeNode[] = [];

  objects.forEach((obj) => {
    if (!obj.Key) return;

    // S3 directory markers end with "/", preserve this info before filtering
    const isDirectory = obj.Key.endsWith("/");

    const pathName = obj.Key.replace(prefix || "", "");
    // Skip if this is the prefix itself (empty after removal)
    if (!pathName) return;

    // Filter empty segments to handle trailing slashes consistently
    const pathSegments = pathName.split("/").filter(Boolean);
    if (pathSegments.length === 0) return;

    buildTreeRecursive(root, pathSegments, obj, bucketKey, prefix, isDirectory);
  });

  return root;
}

/**
 * Build directory tree from S3 objects.
 * Works with both SSR path (_Object[] from S3) and client path (_Object[] from DuckDB index).
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
  return buildTree(bucketKey, files, prefix);
}
