import { IconButton, TruncatedText, useContextMenu } from "@cytario/design";
import { MouseEventHandler, ReactNode } from "react";
import { NavLink, useMatch } from "react-router";
import { twMerge } from "tailwind-merge";

import { useNodeContextMenu } from "./NodeContextMenu";
import { NodeIndicator } from "./NodeIndicator";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { buildConnectionPath } from "~/utils/resourceId";

export interface NodeLinkProps {
  node: TreeNode;
  onClick?: (node: TreeNode) => void;
  contextMenu?: boolean;
  /** Caller-specific `MenuItem`s appended to the context menu (see `NodeContextMenu`). */
  contextMenuItems?: ReactNode;
  isClickable?: (node: TreeNode) => boolean;
  className?: string;
}

/**
 * Single visual representation of a `TreeNode` shared across list, grid and
 * tree views. Renders an appropriate leading visual (connection status dot for
 * buckets, file-type icon otherwise), the node name, and an optional trailing
 * context menu trigger. Pass `isClickable={() => false}` to render the row as
 * a non-navigating block (e.g. when an outer element already owns navigation).
 * A node whose path matches the current URL is treated as the current location:
 * non-navigating, active-styled, and flagged `isCurrent` to its context menu.
 */
export function NodeLink({
  node,
  onClick,
  contextMenu = true,
  contextMenuItems,
  isClickable = () => true,
  className,
}: NodeLinkProps) {
  const to = buildConnectionPath(node.connectionName, node.pathName);
  const isCurrent = Boolean(useMatch({ path: to, end: true }));
  const clickable = isClickable(node) && !isCurrent;

  const rowCx = `
    flex items-center grow 
    font-medium text-sm
    min-w-0 h-7 px-2 gap-0.5
    rounded-full
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

  const { content, dialog } = useNodeContextMenu({
    node,
    isCurrent,
    extraItems: contextMenuItems,
  });
  const { targetProps, triggerProps, menu } = useContextMenu({ content });
  // Right-click the whole row (or the kebab, for keyboard) opens the menu at the
  // cursor. Rows without a menu fall through to the native context menu.
  const hasMenu = contextMenu && content != null;

  return (
    <div className={twMerge(rowCx, className, "px-0")} {...(hasMenu ? targetProps : {})}>
      {clickable ? (
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
        <div className={twMerge(rowCx, isCurrent && activeCx)}>
          <NodeIndicator node={node} />
          <TruncatedText>{node.name}</TruncatedText>
        </div>
      )}

      {hasMenu && (
        <>
          {/* Capture-phase preventDefault cancels the native <a> navigation when
              the kebab lives inside a navigable card (GridItem's <Link>), without
              stopping propagation — so the button's press still opens the menu. */}
          <span className="flex" onClickCapture={(e) => e.preventDefault()}>
            <IconButton
              {...triggerProps}
              icon="EllipsisVertical"
              label={`Actions for ${node.name}`}
              variant="ghost"
              size="xs"
            />
          </span>
          {menu}
          {dialog}
        </>
      )}
    </div>
  );
}
