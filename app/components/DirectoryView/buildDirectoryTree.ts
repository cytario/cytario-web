import { ObjectPresignedUrl } from "~/routes/objects.route";
import { isOmeTiff } from "~/utils/omeTiffOffsets";

export type TreeNodeType = "bucket" | "directory" | "file";

export interface TreeNode {
  alias: string;
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
  alias: string,
  parentPath: string = "",
) {
  const name = keyParts[0];
  let pathName = parentPath + name;
  if (keyParts.length > 1) pathName += "/";

  if (keyParts.length === 1) {
    currentDir.push({
      alias,
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
        alias,
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
      isOmeTiff(obj.Key ?? "") &&
      !isOmeTiff(existingDir._Object?.Key ?? "")
    ) {
      existingDir._Object = obj;
    }

    buildDirectoryTreeRecursive(
      existingDir.children,
      keyParts.slice(1),
      obj,
      bucketName,
      provider,
      alias,
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

export function buildDirectoryTree(
  bucketName: string,
  objects: ObjectPresignedUrl[],
  provider: string,
  alias: string,
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
      alias,
    );
  });

  return root;
}
