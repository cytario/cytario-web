import { ObjectPresignedUrl } from "~/routes/objects.route";

export type TreeNodeType = "bucket" | "directory" | "file";

export type TreeNode = {
  provider: string;
  bucketName: string;
  name: string;
  type: TreeNodeType;
  pathName?: string;
  children: TreeNode[];
  _Object?: ObjectPresignedUrl;
};

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
