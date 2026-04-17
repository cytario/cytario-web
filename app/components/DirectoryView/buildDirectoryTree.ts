import type { _Object } from "@aws-sdk/client-s3";

import { isImageFile } from "~/utils/fileType";
import { isZarrPath } from "~/utils/zarrUtils";

export type TreeNodeType = "bucket" | "directory" | "file";

/**
 * A node in the storage directory tree.
 *
 * Structurally extends `@cytario/design` `TreeNode` (`{ id, name, children? }`)
 * so it can be passed directly to the design system `<Tree>` component without
 * conversion. Callbacks like `onActivate` return the full `TreeNode`,
 * eliminating the need for reverse-lookup helpers.
 *
 * Connection-level metadata (`provider`, `bucketName`, etc.) is not stored on
 * every node — look it up from the connections store via `connectionName`.
 */
export interface TreeNode {
  /** Globally unique identifier: `connectionName/pathName`. */
  id: string;
  /** Name of the connection config this node belongs to. */
  connectionName: string;
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
      id: `${connectionName}/${pathName}`,
      connectionName,
      type: "file",
      name,
      pathName,
      children: [],
      _Object: obj,
    });
  } else {
    // Zarr directories are images — treat as leaf nodes, skip recursion
    // into the thousands of internal chunk files.
    if (isZarrPath(name)) {
      if (!currentDir.find((child) => child.name === name)) {
        currentDir.push({
          id: `${connectionName}/${pathName}`,
          connectionName,
          type: "file",
          name,
          pathName,
          children: [],
          _Object: obj,
        });
      }
      return;
    }

    let existingDir = currentDir.find((child) => child.name === name);
    if (!existingDir) {
      existingDir = {
        id: `${connectionName}/${pathName}`,
        connectionName,
        type: "directory",
        name,
        pathName,
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
  objects: _Object[],
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
      connectionName,
      basePath,
    );
  });

  return root;
}
