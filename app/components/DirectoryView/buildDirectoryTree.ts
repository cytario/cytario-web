import { BucketConfig } from "~/.generated/client";
import { ObjectPresignedUrl } from "~/routes/objects.route";

export type TreeNode = {
  type: "bucket" | "directory" | "file";
  name: string;
  bucketName: string;
  pathName?: string;
  children: TreeNode[];
  _Object?: ObjectPresignedUrl;
  _Bucket?: BucketConfig;
};

function buildDirectoryTreeRecursive(
  currentDir: TreeNode[],
  keyParts: string[],
  obj: ObjectPresignedUrl,
  bucketName: string,
  parentPath: string = "",
  bucketConfig?: BucketConfig
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
      children: [],
      _Object: obj,
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
        _Object: obj,
        _Bucket: bucketConfig,
      };
      currentDir.push(existingDir);
    }

    buildDirectoryTreeRecursive(
      existingDir.children,
      keyParts.slice(1),
      obj,
      bucketName,
      pathName,
      bucketConfig
    );
  }
}

export function buildDirectoryTree(
  bucketName: string,
  objects: ObjectPresignedUrl[],
  prefix?: string,
  bucketConfig?: BucketConfig
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
      prefix,
      bucketConfig
    );
  });

  return root;
}
