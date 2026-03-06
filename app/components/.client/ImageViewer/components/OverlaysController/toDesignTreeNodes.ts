import type { TreeNode as DesignTreeNode } from "@cytario/design";
import { Archive, File, Folder } from "lucide-react";

import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

const nodeTypeIcons = {
  bucket: Archive,
  directory: Folder,
  file: File,
} as const;

/**
 * Converts a `TreeNode` from the directory tree builder into a `TreeNode`
 * compatible with the `@cytario/design` Tree component.
 *
 * The design system Tree expects `{ id, name, icon?, children? }` while
 * the app's `buildDirectoryTree` produces nodes with `{ provider, bucketName,
 * name, type, pathName?, children }`. This function bridges the two,
 * assigning a unique `id` from `pathName` (or falling back to `name`)
 * and mapping `type` to a Lucide icon.
 */
export function toDesignTreeNodes(nodes: TreeNode[]): DesignTreeNode[] {
  return nodes.map((node) => {
    const designNode: DesignTreeNode = {
      id: node.pathName ?? node.name,
      name: node.name,
      icon: nodeTypeIcons[node.type],
    };

    if (node.children.length > 0) {
      designNode.children = toDesignTreeNodes(node.children);
    }

    return designNode;
  });
}

/**
 * Finds the original `TreeNode` from the directory tree that corresponds
 * to a selected design tree node id (which is `pathName` or `name`).
 * Performs a depth-first search through the tree.
 */
export function findOriginalNode(
  nodes: TreeNode[],
  id: string,
): TreeNode | undefined {
  for (const node of nodes) {
    const nodeId = node.pathName ?? node.name;
    if (nodeId === id) return node;

    if (node.children.length > 0) {
      const found = findOriginalNode(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}
