import { type ReactNode, useRef } from "react";
import { Link } from "react-router";
import { twMerge } from "tailwind-merge";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { NodeIcon } from "~/components/DirectoryView/NodeLink/NodeIcon";
import { NodeLink } from "~/components/DirectoryView/NodeLink/NodeLink";
import { buildConnectionPath } from "~/utils/resourceId";

interface GridItemProps {
  node: TreeNode;
  preview?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Grid card: preview slot + NodeLink row + optional meta. Card-wide right-click
 *  delegates to NodeLink's context menu via `onContextMenuTarget`. */
export function GridItem({ node, preview, children, className }: GridItemProps) {
  const to = buildConnectionPath(node.connectionId, node.pathName);
  const contextMenuRef = useRef<((event: React.MouseEvent) => void) | null>(null);

  const cx = `
    group flex flex-col overflow-hidden rounded-xl
    bg-background
    border border-border
    transition-all
    hover:border-ring
  `;

  return (
    <Link
      to={to}
      className={twMerge(cx, className)}
      onContextMenu={(e) => contextMenuRef.current?.(e)}
    >
      <div className="shrink-0 overflow-hidden bg-card aspect-4/3 rounded-t-lg ">
        {preview ?? (
          <div className="flex h-full w-full items-center justify-center">
            <NodeIcon node={node} size="xl" />
          </div>
        )}
      </div>

      <div
        className={`
          flex flex-col
          p-2 gap-1
          border-t border-border
        `}
      >
        <NodeLink
          node={node}
          isClickable={() => false}
          onContextMenuTarget={(handler) => {
            contextMenuRef.current = handler;
          }}
        />
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
    </Link>
  );
}
