import { Tree, type TreeNode as DesignTreeNode } from "@cytario/design";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router";

import { type TreeNode } from "./buildDirectoryTree";
import { getFileIcon } from "./fileTypeHelpers";
import { NodeLinkIcon } from "./NodeLink/NodeLinkIcon";
import { TooltipSpan } from "../Tooltip/TooltipSpan";
import { createResourceId } from "~/utils/resourceId";

/* ------------------------------------------------------------------ */
/*  Tree node conversion                                               */
/* ------------------------------------------------------------------ */

/**
 * Converts app TreeNodes into the design system TreeNode format.
 * Uses pathName as the unique id since it is unique within a bucket.
 */
function toDesignTreeNodes(nodes: TreeNode[]): DesignTreeNode[] {
  return nodes.map((node) => {
    const designNode: DesignTreeNode = {
      id: node.pathName ?? node.name,
      name: node.name,
      icon: getFileIcon(node),
    };

    if (node.children.length > 0) {
      designNode.children = toDesignTreeNodes(node.children);
    }

    return designNode;
  });
}

/**
 * Finds the original TreeNode from the directory tree that corresponds
 * to a design tree node id (which is pathName or name).
 */
function findOriginalNode(
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

/* ------------------------------------------------------------------ */
/*  DirectoryViewTree                                                  */
/* ------------------------------------------------------------------ */

interface DirectoryViewTreeProps {
  /** The full (unfiltered) tree of nodes. Filtering is done via searchTerm. */
  nodes: TreeNode[];
  /** Pass-through search term for the Tree component's built-in filtering. */
  searchTerm?: string;
}

export function DirectoryViewTree({
  nodes,
  searchTerm,
}: DirectoryViewTreeProps) {
  const navigate = useNavigate();
  const treeData = useMemo(() => toDesignTreeNodes(nodes), [nodes]);

  return (
    <div className="overflow-hidden rounded-[var(--border-radius-md)] border border-[var(--color-border-default)]">
      <Tree
        aria-label="Directory tree"
        data={treeData}
        selectionMode="none"
        openByDefault
        size="comfortable"
        height={600}
        searchTerm={searchTerm}
        searchMatch={(node, term) =>
          node.name.toLowerCase().includes(term.toLowerCase())
        }
        onActivate={(designNode) => {
          const original = findOriginalNode(nodes, designNode.id);
          if (!original) return;

          const to = `/buckets/${createResourceId(original.provider, original.bucketName, original.pathName)}`.replace(
            /\/$/,
            "",
          );
          navigate(to);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Lightweight recursive tree (used by GlobalSearch / Suggestions)    */
/* ------------------------------------------------------------------ */

/**
 * Simple recursive tree for search suggestions and lightweight contexts
 * where the full design system Tree is not needed.
 */
export function DirectoryTree({
  nodes,
  action,
  className,
}: {
  nodes: TreeNode[];
  action?: (node: TreeNode) => void;
  className?: string;
}) {
  return (
    <ul className="pl-6">
      {nodes.map((node) => {
        const resourceId = createResourceId(
          node.provider,
          node.bucketName,
          node.pathName,
        );
        const to = `/buckets/${resourceId}`.replace(/\/$/, "");

        return (
          <li key={node.name}>
            <div className="flex items-center gap-1 min-h-8">
              <Link
                to={to}
                className={[
                  "flex flex-row flex-grow items-center h-full min-w-0 gap-1",
                  "text-cytario-turquoise-700 hover:text-cytario-turquoise-900 hover:underline",
                  className,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={
                  action
                    ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        action(node);
                      }
                    : undefined
                }
              >
                <NodeLinkIcon node={node} />
                <TooltipSpan>{node.name}</TooltipSpan>
              </Link>
            </div>
            {node.children && node.children.length > 0 && (
              <DirectoryTree
                nodes={node.children}
                action={action}
                className={className}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
