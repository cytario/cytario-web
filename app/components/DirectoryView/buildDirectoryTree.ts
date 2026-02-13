import { ObjectPresignedUrl } from "~/routes/objects.route";

/** Represents the type of node in the directory tree hierarchy. */
export type TreeNodeType = "bucket" | "directory" | "file";

/**
 * Represents a node in a hierarchical directory tree structure.
 * Used to display S3 bucket contents in a navigable tree view.
 *
 * @property provider - Cloud storage provider (e.g., "aws", "minio").
 * @property bucketName - Name of the S3 bucket this node belongs to.
 * @property name - Display name of this node (file name or directory name).
 * @property type - Type of node: "bucket" for root, "directory" for folders, "file" for objects.
 * @property pathName - Full path from bucket root to this node (e.g., "folder/subfolder/file.txt").
 * @property children - Child nodes (empty array for files, populated for directories/buckets).
 * @property _Object - Original S3 object metadata, present for file and directory nodes.
 */
export interface TreeNode {
  provider: string;
  bucketName: string;
  name: string;
  type: TreeNodeType;
  pathName?: string;
  children: TreeNode[];
  _Object?: ObjectPresignedUrl;
}

function buildDirectoryTreeRecursive(
  currentDir: TreeNode[],
  keyParts: string[],
  obj: ObjectPresignedUrl,
  bucketName: string,
  provider: string,
  parentPath: string = "",
) {
  const name = keyParts[0];
  let pathName = parentPath + name;
  if (keyParts.length > 1) pathName += "/";

  if (keyParts.length === 1) {
    currentDir.push({
      type: "file",
      name,
      pathName,
      bucketName,
      provider,
      children: [],
      _Object: obj,
    });
  } else {
    let existingDir = currentDir.find((child) => child.name === name);
    if (!existingDir) {
      existingDir = {
        type: "directory",
        name,
        pathName,
        bucketName,
        provider,
        children: [],
        _Object: obj,
      };
      currentDir.push(existingDir);
    } else if (
      obj.Key?.endsWith(".ome.tif") &&
      !existingDir._Object?.Key?.endsWith(".ome.tif")
    ) {
      existingDir._Object = obj;
    }

    buildDirectoryTreeRecursive(
      existingDir.children,
      keyParts.slice(1),
      obj,
      bucketName,
      provider,
      pathName,
    );
  }
}

/**
 * Transforms a flat list of S3 objects into a hierarchical tree structure.
 *
 * @param bucketName - Name of the S3 bucket containing these objects.
 * @param objects - Flat array of S3 objects with Key paths (e.g., "folder/file.txt").
 * @param provider - Cloud storage provider identifier (e.g., "aws", "gcp").
 * @param prefix - Optional path prefix to strip from object keys before building the tree.
 * @returns Array of root-level TreeNode objects representing the directory structure.
 *
 * @example
 * const objects = [
 *   { Key: "images/photo.jpg" },
 *   { Key: "images/icons/logo.png" },
 *   { Key: "readme.txt" }
 * ];
 * const tree = buildDirectoryTree("my-bucket", objects, "aws");
 * // Returns: [
 * //   { name: "images", type: "directory", children: [...] },
 * //   { name: "readme.txt", type: "file", children: [] }
 * // ]
 */
export function buildDirectoryTree(
  bucketName: string,
  objects: ObjectPresignedUrl[],
  provider: string,
  prefix?: string,
): TreeNode[] {
  const root: TreeNode[] = [];

  objects.forEach((obj) => {
    if (!obj.Key) return;

    const pathName = obj.Key.replace(prefix || "", "");
    const pathSegments = pathName.split("/");

    buildDirectoryTreeRecursive(
      root,
      pathSegments,
      obj,
      bucketName,
      provider,
      prefix,
    );
  });

  return root;
}
