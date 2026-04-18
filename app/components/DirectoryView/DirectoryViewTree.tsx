import { Tree } from "@cytario/design";
import { icons } from "lucide-react";
import { Link, useNavigate } from "react-router";

import { type TreeNode } from "./buildDirectoryTree";
import type { DirectoryKind } from "./DirectoryView";
import { DirectoryViewEmptyState } from "./DirectoryViewEmptyState";
import { TooltipSpan } from "../Tooltip/TooltipSpan";
import { getFileTypeIcon } from "~/utils/fileType";
import { buildConnectionPath } from "~/utils/resourceId";

/* ------------------------------------------------------------------ */
/*  DirectoryViewTree                                                  */
/* ------------------------------------------------------------------ */

interface DirectoryViewTreeProps {
  /** The full (unfiltered) tree of nodes. Filtering is done via searchTerm. */
  nodes: TreeNode[];
  /** Pass-through search term for the Tree component's built-in filtering. */
  searchTerm?: string;
  kind: DirectoryKind;
}

export function NodeLinkIcon({ node }: { node: TreeNode }) {
  const iconName = node.type === "file" ? getFileTypeIcon(node.name) : "Folder";
  const resolvedName = node.type === "bucket" ? "Archive" : iconName;
  const IconComponent = icons[resolvedName] ?? icons["File"];

  return (
    <div className="flex items-center justify-center">
      <IconComponent strokeWidth={1.5} size={24} />
    </div>
  );
}

/**
 * Thin wrapper around `@cytario/design`'s `<Tree>` (react-arborist under the
 * hood) that navigates on row activation. Used by the tree view mode in
 * `DirectoryView` and `recent.route.tsx`.
 *
 * @deprecated Planned for removal as part of tree consolidation — see
 * [C-150](https://app.plane.so/cytario/browse/C-150/). Once the design-system
 * `<Tree>` supports auto-height + controllable open state (or is rewritten),
 * this wrapper and {@link DirectoryTree} should collapse into a single
 * component used across the app.
 */
export function DirectoryViewTree({
  nodes,
  searchTerm,
  kind,
}: DirectoryViewTreeProps) {
  const navigate = useNavigate();

  if (nodes.length === 0) return <DirectoryViewEmptyState kind={kind} />;

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
        onActivate={(node) =>
          navigate(buildConnectionPath(node.connectionName, node.pathName))
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Lightweight recursive tree (used by GlobalSearch / Suggestions)    */
/* ------------------------------------------------------------------ */

interface DirectoryTreeProps {
  nodes: TreeNode[];
  action?: (node: TreeNode) => void;
  className?: string;
}

function DirectoryTreeRecursive({
  nodes,
  action,
  className,
}: DirectoryTreeProps) {
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
                  "flex flex-row grow items-center h-full min-w-0 gap-1",
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
              <DirectoryTreeRecursive
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

/**
 * Simple recursive tree for search suggestions and lightweight contexts
 * where the design-system `<Tree>` (with its fixed height + virtualization)
 * doesn't fit. Used by `search.route.tsx` and `GlobalSearch/Suggestions.tsx`.
 *
 * @deprecated Planned for removal as part of tree consolidation — see
 * [C-150](https://app.plane.so/cytario/browse/C-150/). One unified tree
 * component should replace both this and {@link DirectoryViewTree}.
 */
export function DirectoryTree(props: DirectoryTreeProps) {
  return <DirectoryTreeRecursive {...props} />;
}
