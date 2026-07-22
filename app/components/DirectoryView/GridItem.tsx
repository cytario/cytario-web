import { type ReactNode } from "react";
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

/**
 * Generic grid item composed of a preview slot on top, a `NodeLink` row in the
 * middle, and an optional meta row at the bottom. Replaces type-specific
 * `StorageConnectionCard` / `FileCard` usages from `@cytario/design`; the card
 * chrome (border, shadow, hover) lives here so we can iterate without
 * round-tripping through the design-system package.
 */
export function GridItem({ node, preview, children, className }: GridItemProps) {
  const to = buildConnectionPath(node.connectionId ?? node.connectionName, node.pathName);

  const cx = `
    group flex flex-col overflow-hidden rounded-2xl
    bg-background
    border border-border
    transition-all
    hover:border-ring
  `;

  return (
    <Link to={to} className={twMerge(cx, className)}>
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
        <NodeLink node={node} isClickable={() => false} />
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
    </Link>
  );
}
