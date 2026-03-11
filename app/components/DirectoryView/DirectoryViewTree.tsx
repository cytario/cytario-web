import {
  Tree,
  type TreeApi,
  type TreeNode as DesignTreeNode,
} from "@cytario/design";
import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { type TreeNode } from "./buildDirectoryTree";
import { getFileIcon } from "./fileTypeHelpers";
import { nodeToPath } from "~/utils/resourceId";

/* ------------------------------------------------------------------ */
/*  Tree node conversion                                               */
/* ------------------------------------------------------------------ */

/**
 * Converts app TreeNodes into the design system TreeNode format.
 * Uses alias + pathName as the unique id to ensure uniqueness across buckets.
 */
export function toDesignTreeNodes(nodes: TreeNode[]): DesignTreeNode[] {
  return nodes.map((node) => {
    const base = node.pathName ?? node.name;
    const designNode: DesignTreeNode = {
      id: node.alias ? `${node.alias}/${base}` : base,
      name: node.name,
      icon: getFileIcon(node),
    };

    if (node.children?.length) {
      designNode.children = toDesignTreeNodes(node.children);
    }

    return designNode;
  });
}

/**
 * Finds the original TreeNode from the directory tree that corresponds
 * to a design tree node id (which is pathName or name).
 */
export function findOriginalNode(
  nodes: TreeNode[],
  id: string,
): TreeNode | undefined {
  for (const node of nodes) {
    const base = node.pathName ?? node.name;
    const nodeId = node.alias ? `${node.alias}/${base}` : base;
    if (nodeId === id) return node;

    if (node.children?.length) {
      const found = findOriginalNode(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  DirectoryViewTree                                                  */
/* ------------------------------------------------------------------ */

interface DirectoryViewTreeProps {
  nodes: TreeNode[];
  searchTerm?: string;
  /** Fixed height mode (e.g. 600 for the main directory browser). */
  height?: number;
  /** Auto-size to fit content. Ignored when height is set. */
  autoHeight?: boolean;
  openByDefault?: boolean;
  size?: "compact" | "comfortable";
  className?: string;
}

export function DirectoryViewTree({
  nodes,
  searchTerm,
  height,
  autoHeight = false,
  openByDefault = true,
  size = "comfortable",
  className,
}: DirectoryViewTreeProps) {
  const navigate = useNavigate();
  const treeData = useMemo(() => toDesignTreeNodes(nodes), [nodes]);
  const treeRef = useRef<TreeApi<DesignTreeNode>>(null);

  const rowHeight = size === "compact" ? 32 : 40;
  const [visibleCount, setVisibleCount] = useState<number | null>(null);

  const computedHeight = autoHeight
    ? (visibleCount ?? treeData.length) * rowHeight
    : (height ?? 400);

  const handleToggle = useCallback(() => {
    if (!autoHeight) return;
    requestAnimationFrame(() => {
      if (treeRef.current) {
        setVisibleCount(treeRef.current.visibleNodes.length);
      }
    });
  }, [autoHeight]);

  return (
    <Tree
      aria-label="Directory tree"
      data={treeData}
      treeRef={treeRef}
      selectionMode="none"
      openByDefault={openByDefault}
      size={size}
      height={computedHeight}
      className={className}
      searchTerm={searchTerm}
      searchMatch={(node, term) =>
        node.name.toLowerCase().includes(term.toLowerCase())
      }
      onToggle={handleToggle}
      onActivate={(designNode) => {
        const original = findOriginalNode(nodes, designNode.id);
        if (!original) return;
        navigate(nodeToPath(original));
      }}
    />
  );
}
