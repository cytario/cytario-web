import type { _Object } from "@aws-sdk/client-s3";

import { isImageFile } from "~/utils/fileType";
import { isZarrPath } from "~/utils/zarrUtils";

export type TreeNodeType = "bucket" | "directory" | "file";

/**
 * A node in the storage directory tree.
 *
 * Structurally extends `@cytario/design` `TreeNode` (`{ id, name, children? }`)
 * so it can be passed directly to the design system `<Tree>` component without
 * conversion. Callbacks like `onActivate` return the full `TreeNode`, eliminating
 * the need for reverse-lookup helpers.
 *
 * ### ID strategy
 *
 * | Node type   | `id` value          | Example                        |
 * |-------------|---------------------|--------------------------------|
 * | bucket root | `connectionName`    | `"aws-prod-bucket"`            |
 * | directory   | `pathName`          | `"results/2024/"`              |
 * | file        | `pathName`          | `"results/2024/output.ome.tif"`|
 *
 * IDs are unique within a single connection's tree. In views that mix multiple
 * connections (e.g. the connections overview), bucket roots use `connectionName`
 * as their ID to guarantee uniqueness.
 *
 * ### Example
 *
 * ```
 * {
 *   id: "results/",
 *   connectionName: "aws-prod-bucket",
 *   provider: "aws",
 *   bucketName: "prod-bucket",
 *   name: "results",
 *   type: "directory",
 *   pathName: "results/",
 *   children: [
 *     {
 *       id: "results/output.ome.tif",
 *       connectionName: "aws-prod-bucket",
 *       provider: "aws",
 *       bucketName: "prod-bucket",
 *       name: "output.ome.tif",
 *       type: "file",
 *       pathName: "results/output.ome.tif",
 *       children: [],
 *       _Object: { Key: "results/output.ome.tif", Size: 1048576 },
 *     },
 *   ],
 * }
 * ```
 */
export interface TreeNode {
  /** Unique identifier — equals `pathName` for files/directories, `connectionName` for bucket roots. */
  id: string;
  /** Name of the connection config this node belongs to. */
  connectionName: string;
  /** Storage provider (e.g. `"aws"`, `"minio"`). */
  provider: string;
  /** S3-compatible bucket name. */
  bucketName: string;
  /** Display name — the last segment of the path (e.g. `"output.ome.tif"`). */
  name: string;
  type: TreeNodeType;
  /**
   * Full path relative to the connection root, including trailing `/` for
   * directories. Empty string `""` for bucket root nodes.
   *
   * Built by `buildDirectoryTree` as the concatenation of ancestor `name`
   * segments. Used for routing via `buildConnectionPath()`.
   */
  pathName: string;
  children: TreeNode[];
  /** Original S3 object metadata. Present for files; for directories, holds the first image object (used for previews). */
  _Object?: _Object;
}

function buildDirectoryTreeRecursive(
  currentDir: TreeNode[],
  keyParts: string[],
  obj: _Object,
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
      id: pathName,
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
    // Zarr directories are images — treat as leaf nodes, skip recursion
    // into the thousands of internal chunk files.
    if (isZarrPath(name)) {
      if (!currentDir.find((child) => child.name === name)) {
        currentDir.push({
          id: pathName,
          connectionName,
          type: "file",
          name,
          pathName,
          bucketName,
          provider,
          children: [],
          _Object: obj,
        });
      }
      return;
    }

    let existingDir = currentDir.find((child) => child.name === name);
    if (!existingDir) {
      existingDir = {
        id: pathName,
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

/** Depth-first search for a node by its `id`. */
export function findNodeById(
  nodes: TreeNode[],
  id: string,
): TreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children.length > 0) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
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
  objects: _Object[],
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
