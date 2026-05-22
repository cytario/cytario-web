import { MouseEventHandler } from "react";
import { Link } from "react-router";
import { twMerge } from "tailwind-merge";

import { NodeContextMenu } from "./NodeContextMenu";
import { NodeIndicator } from "./NodeIndicator";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { TooltipSpan } from "~/components/Tooltip/TooltipSpan";
import { buildConnectionPath } from "~/utils/resourceId";

export interface NodeLinkProps {
  node: TreeNode;
  onClick?: (node: TreeNode) => void;
  contextMenu?: boolean;
  /** When false, render as a non-navigating row (no `<Link>`, no keydown). */
  link?: boolean;
  className?: string;
}

/**
 * Single visual representation of a `TreeNode` shared across list, grid and
 * tree views. Renders an appropriate leading visual (connection status dot for
 * buckets, file-type icon otherwise), the node name, and an optional trailing
 * context menu trigger. Pass `link={false}` when an outer element already owns
 * navigation (e.g. a tree row).
 */
export function NodeLink({
  node,
  onClick,
  contextMenu = true,
  link = true,
  className,
}: NodeLinkProps) {
  const to = buildConnectionPath(node.connectionName, node.pathName);

  const rowCx = "flex items-center grow border border-transparent rounded-md";
  const linkCx = `
    hover:bg-slate-100
    focus-visible:outline focus-visible:outline-(--color-border-focus)
  `;
  const handleClick: MouseEventHandler<HTMLAnchorElement> = (event) => {
    if (!onClick) return;
    event.preventDefault();
    event.stopPropagation();
    onClick(node);
  };

  return (
    <div className={twMerge(rowCx, className)}>
      {link ? (
        <Link to={to} className={twMerge(rowCx, linkCx)} onClick={handleClick}>
          <NodeIndicator node={node} />
          <TooltipSpan>{node.name}</TooltipSpan>
        </Link>
      ) : (
        <div className={rowCx}>
          <NodeIndicator node={node} />
          <TooltipSpan>{node.name}</TooltipSpan>
        </div>
      )}

      {contextMenu && <NodeContextMenu node={node} />}
    </div>
  );
}
