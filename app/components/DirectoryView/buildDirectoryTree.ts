import { ObjectPresignedUrl } from "~/routes/objects.route";
import { isImageFile } from "~/utils/fileType";

export type TreeNodeType = "bucket" | "directory" | "file";

export interface TreeNode {
  connectionName: string;
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
  connectionName: string,
  parentPath: string = "",
) {
  const name = keyParts[0];
  let pathName = parentPath + name;
  if (keyParts.length > 1) pathName += "/";

  if (keyParts.length === 1) {
    // Skip empty-name leaf nodes produced by S3 folder markers (keys ending
    // in "/").  The parent directory was already created by the recursive
    // call, so there is nothing to add.
    if (name === "") return;

    currentDir.push({
      connectionName,
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
        connectionName,
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
      isImageFile(obj.Key ?? "") &&
      !isImageFile(existingDir._Object?.Key ?? "")
    ) {
      existingDir._Object = obj;
    }

    buildDirectoryTreeRecursive(
      existingDir.children,
      keyParts.slice(1),
      obj,
      bucketName,
      provider,
      connectionName,
      pathName,
    );
  }
}

/** Total size of all files under a directory node. */
export function computeDirectorySize(node: TreeNode): number {
  if (node.type === "file") return node._Object?.Size ?? 0;
  if (node.children.length === 0) return node._Object?.Size ?? 0;
  return node.children.reduce(
    (sum, child) => sum + computeDirectorySize(child),
    0,
  );
}

/** Latest LastModified timestamp under a directory node. */
export function computeDirectoryLastModified(node: TreeNode): number {
  if (node.type === "file") {
    return node._Object?.LastModified
      ? new Date(node._Object.LastModified).getTime()
      : 0;
  }
  if (node.children.length === 0) {
    return node._Object?.LastModified
      ? new Date(node._Object.LastModified).getTime()
      : 0;
  }
  return node.children.reduce(
    (max, child) => Math.max(max, computeDirectoryLastModified(child)),
    0,
  );
}

/**
 * Build a directory tree from S3 objects.
 *
 * @param prefix  S3 listing prefix to strip from object keys
 * @param urlPath Path relative to the connection root (prepended to node
 *                pathNames so they stay routable via `/connections/:connectionName/*`)
 */
export function buildDirectoryTree(
  bucketName: string,
  objects: ObjectPresignedUrl[],
  provider: string,
  connectionName: string,
  prefix?: string,
  urlPath?: string,
): TreeNode[] {
  const root: TreeNode[] = [];
  const basePath = urlPath ? (urlPath.endsWith("/") ? urlPath : `${urlPath}/`) : "";

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
      connectionName,
      basePath,
    );
  });

  return root;
}
