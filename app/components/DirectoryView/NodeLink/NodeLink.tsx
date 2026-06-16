import { TruncatedText } from "@cytario/design";
import { MouseEventHandler } from "react";
import { NavLink } from "react-router";
import { twMerge } from "tailwind-merge";

import { NodeContextMenu } from "./NodeContextMenu";
import { NodeIndicator } from "./NodeIndicator";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { buildConnectionPath } from "~/utils/resourceId";

export interface NodeLinkProps {
  node: TreeNode;
  onClick?: (node: TreeNode) => void;
  contextMenu?: boolean;
  isClickable?: (node: TreeNode) => boolean;
  className?: string;
}

/**
 * Single visual representation of a `TreeNode` shared across list, grid and
 * tree views. Renders an appropriate leading visual (connection status dot for
 * buckets, file-type icon otherwise), the node name, and an optional trailing
 * context menu trigger. Pass `isClickable={() => false}` to render the row as
 * a non-navigating block (e.g. when an outer element already owns navigation).
 */
export function NodeLink({
  node,
  onClick,
  contextMenu = true,
  isClickable = () => true,
  className,
}: NodeLinkProps) {
  const to = buildConnectionPath(node.connectionName, node.pathName);

  const rowCx = `
    flex items-center grow 
    min-w-0 h-7 gap-0.5
    border border-transparent
    rounded-md
  `;

  const clickAbleCx = `
    hover:bg-muted hover:text-foreground
    focus-visible:outline focus-visible:outline-ring
  `;

  const activeCx = "bg-muted text-foreground";

  const handleClick: MouseEventHandler<HTMLAnchorElement> = (event) => {
    if (!onClick) return;
    event.preventDefault();
    event.stopPropagation();
    onClick(node);
  };

  return (
    <div className={twMerge(rowCx, className)}>
      {isClickable(node) ? (
        <NavLink
          to={to}
          end
          className={({ isActive }) => twMerge(rowCx, clickAbleCx, isActive && activeCx)}
          onClick={handleClick}
        >
          <NodeIndicator node={node} />
          <TruncatedText>{node.name}</TruncatedText>
        </NavLink>
      ) : (
        <div className={rowCx}>
          <NodeIndicator node={node} />
          <TruncatedText>{node.name}</TruncatedText>
        </div>
      )}

      {contextMenu && <NodeContextMenu node={node} />}
    </div>
  );
}
