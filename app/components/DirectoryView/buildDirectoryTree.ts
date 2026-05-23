import type { _Object } from "@aws-sdk/client-s3";

import { isImageFile } from "~/utils/fileType";
import { isZarrPath } from "~/utils/zarrUtils";

export type TreeNodeType = "bucket" | "directory" | "file";

/**
 * A node in the storage directory tree. Shape matches `@cytario/design`
 * `TreeNode` so it can be passed straight to the design-system `<Tree>`.
 */
export interface TreeNode {
  id: string;
  connectionName: string;
  pathName: string;
  name: string;

  type: TreeNodeType;
  children?: TreeNode[];

  _Object?: _Object;

  hasChildren?: boolean;
  isLeaf?: boolean;
  /** `"idle"` marks a lazy stub awaiting fetch via `DirectoryViewTree`'s `onExpand`. */
  loadState?: "idle";

  connectionStatus?: "connected" | "error";
  connectionErrorMessage?: string;
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
    // Skip empty-name leaves from S3 folder marker keys (ending in "/").
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
    // Zarr directories are images — treat as leaf, skip the thousands of chunks.
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
    } else if (isImageFile(obj.Key ?? "") && !isImageFile(existingDir._Object?.Key ?? "")) {
      existingDir._Object = obj;
    }

    if (!existingDir.children) existingDir.children = [];
    buildDirectoryTreeRecursive(
      existingDir.children,
      keyParts.slice(1),
      obj,
      connectionName,
      pathName,
    );
  }
}

/**
 * Returns ids of every non-leaf node in the tree — useful as
 * `defaultExpandedItems` on `DirectoryViewTree` to pre-expand a static
 * search-result tree.
 */
export function collectInteriorIds(nodes: TreeNode[]): string[] {
  const ids: string[] = [];
  function walk(ns: TreeNode[]) {
    for (const n of ns) {
      if (n.type !== "file" && n.children && n.children.length > 0) {
        ids.push(n.id);
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return ids;
}

export function findNodeById(nodes: TreeNode[], id: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children && node.children.length > 0) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

export function computeDirectorySize(node: TreeNode): number {
  if (node.type === "file") return node._Object?.Size ?? 0;
  if (!node.children || node.children.length === 0) {
    return node._Object?.Size ?? 0;
  }
  return node.children.reduce((sum, child) => sum + computeDirectorySize(child), 0);
}

export function computeDirectoryLastModified(node: TreeNode): number {
  if (node.type === "file") {
    return node._Object?.LastModified ? new Date(node._Object.LastModified).getTime() : 0;
  }
  if (!node.children || node.children.length === 0) {
    return node._Object?.LastModified ? new Date(node._Object.LastModified).getTime() : 0;
  }
  return node.children.reduce(
    (max, child) => Math.max(max, computeDirectoryLastModified(child)),
    0,
  );
}

interface BuildLevelTreeArgs {
  contents: _Object[];
  commonPrefixes: string[];
  connectionName: string;
  /** Listing prefix to strip from keys to derive node names. Empty at bucket root. */
  prefix?: string;
  /** Path relative to connection root, prepended to `pathName`. */
  urlPath?: string;
}

/**
 * Build a single-level tree from a paginated S3 listing with `Delimiter: "/"`.
 * Zarr `CommonPrefixes` collapse into a single leaf node.
 */
export function buildLevelTree({
  contents,
  commonPrefixes,
  connectionName,
  prefix,
  urlPath,
}: BuildLevelTreeArgs): TreeNode[] {
  const basePath = urlPath ? (urlPath.endsWith("/") ? urlPath : `${urlPath}/`) : "";
  const stripPrefix = prefix ?? "";
  const nodes: TreeNode[] = [];

  for (const cp of commonPrefixes) {
    const relative = cp.startsWith(stripPrefix) ? cp.slice(stripPrefix.length) : cp;
    const name = relative.replace(/\/$/, "");
    if (!name) continue;
    const pathName = `${basePath}${name}/`;
    const isZarr = isZarrPath(name);

    nodes.push({
      id: `${connectionName}/${pathName}`,
      connectionName,
      type: isZarr ? "file" : "directory",
      name,
      pathName,
      // Empty array → chevron + lazy expansion; `undefined` → no chevron.
      children: isZarr ? undefined : [],
      hasChildren: !isZarr,
      isLeaf: isZarr,
      loadState: isZarr ? undefined : "idle",
    });
  }

  for (const obj of contents) {
    if (!obj.Key) continue;
    const relative = obj.Key.startsWith(stripPrefix) ? obj.Key.slice(stripPrefix.length) : obj.Key;
    if (!relative || relative.endsWith("/")) continue;
    const name = relative.split("/").pop()!;
    if (!name) continue;
    const pathName = `${basePath}${relative}`;

    nodes.push({
      id: `${connectionName}/${pathName}`,
      connectionName,
      type: "file",
      name,
      pathName,
      isLeaf: true,
      _Object: obj,
    });
  }

  return nodes;
}

/** Build a recursive directory tree from a flat S3 object listing. */
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

    buildDirectoryTreeRecursive(root, pathSegments, obj, connectionName, basePath);
  });

  return root;
}
