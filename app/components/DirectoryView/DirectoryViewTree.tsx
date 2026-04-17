import { Tree } from "@cytario/design";
import { Link, useNavigate } from "react-router";

import { type TreeNode } from "./buildDirectoryTree";
import { NodeLinkIcon } from "./NodeLink/NodeLinkIcon";
import { TooltipSpan } from "../Tooltip/TooltipSpan";
import { buildConnectionPath } from "~/utils/resourceId";

/* ------------------------------------------------------------------ */
/*  DirectoryViewTree                                                  */
/* ------------------------------------------------------------------ */

interface DirectoryViewTreeProps {
  /** The full (unfiltered) tree of nodes. Filtering is done via searchTerm. */
  nodes: TreeNode[];
  /** Pass-through search term for the Tree component's built-in filtering. */
  searchTerm?: string;
  /** Connection name for single-connection views. Falls back to node.connectionName when absent. */
  connectionName?: string;
}

export function DirectoryViewTree({
  nodes,
  searchTerm,
  connectionName,
}: DirectoryViewTreeProps) {
  const navigate = useNavigate();

  return (
    <div className="overflow-hidden rounded-[var(--border-radius-md)] border border-[var(--color-border-default)]">
      <Tree
        aria-label="Directory tree"
        data={nodes}
        selectionMode="none"
        openByDefault
        size="comfortable"
        height={600}
        searchTerm={searchTerm}
        searchMatch={(node, term) =>
          node.name.toLowerCase().includes(term.toLowerCase())
        }
        onActivate={(node) => navigate(buildConnectionPath(connectionName ?? node.connectionName, node.pathName))}
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
        const to = buildConnectionPath(node.connectionName, node.pathName);

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
