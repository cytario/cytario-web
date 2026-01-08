import { _Object } from "@aws-sdk/client-s3";

export type TreeNodeType = "bucket" | "directory" | "file";
export type TreeNode = {
  id: string; // Full resourceId: "provider/bucket/path"
  type: TreeNodeType;
  name: string;
  children: TreeNode[];
  _Object?: _Object;
};

/**
 * Recursive tree builder that processes S3 objects into a tree structure.
 * @param bucketKey - The bucket key in format "provider/bucketName"
 * @param prefix - The accumulated path within the bucket (with trailing slash if non-empty)
 */
function buildTreeRecursive(
  currentDir: TreeNode[],
  keyParts: string[],
  obj: _Object,
  bucketKey: string,
  prefix: string = "",
  isDirectory?: boolean
) {
  const pathName = keyParts[0];
  const id = [bucketKey, prefix + pathName].join("/");

  if (keyParts.length === 1) {
    currentDir.push({
      id,
      type: isDirectory ? "directory" : "file",
      name: pathName,
      children: [],
      _Object: obj,
    });
  } else {
    let existingDir = currentDir.find((child) => child.name === pathName);
    if (!existingDir) {
      existingDir = {
        id,
        type: "directory",
        name: pathName,
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
      prefix,
      isDirectory
    );
  }
}

/**
 * Build tree from S3 objects.
 * @param bucketKey - The bucket key in format "provider/bucketName"
 */
export function buildDirectoryTree(
  bucketKey: string,
  objects: _Object[],
  prefix?: string
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
