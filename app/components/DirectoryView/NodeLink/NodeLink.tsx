import { Checkbox, TruncatedText } from "@cytario/design";
import { type MouseEventHandler, type ReactNode } from "react";
import { NavLink, useMatch } from "react-router";
import { twMerge } from "tailwind-merge";

import { useNodeContextMenu } from "./NodeContextMenu/useNodeContextMenu";
import { NodeIndicator } from "./NodeIndicator";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { buildConnectionPath } from "~/utils/resourceId";

export interface NodeLinkProps {
  node: TreeNode;
  onClick?: (node: TreeNode) => void;
  contextMenu?: boolean;
  /** Caller-specific `MenuItem`s appended to the context menu. */
  contextMenuItems?: ReactNode;
  isClickable?: (node: TreeNode) => boolean;
  className?: string;
  /** When provided, renders a checkbox before the node. Used by the storage picker. */
  isSelected?: (node: TreeNode) => boolean;
  /** Called when the checkbox is toggled. Only rendered when `isSelected` is also provided. */
  onToggleSelect?: (node: TreeNode) => void;
  /** When provided, the context menu's right-click handler is delegated to the
   *  parent (e.g. GridItem spreads it on its card). NodeLink does not spread
   *  `targetProps` on its own row in this case. */
  onContextMenuTarget?: (handler: ((event: React.MouseEvent) => void) | null) => void;
}

export function NodeLink(props: NodeLinkProps) {
  if (props.contextMenu === false) {
    return <NodeLinkPlain {...props} />;
  }
  return <NodeLinkWithMenu {...props} />;
}

function NodeLinkPlain({
  node,
  onClick,
  isClickable = () => true,
  className,
  isSelected,
  onToggleSelect,
}: NodeLinkProps) {
  const to = buildConnectionPath(node.connectionId, node.pathName);
  const isCurrent = Boolean(useMatch({ path: to, end: true }));
  const clickable = isClickable(node) && !isCurrent;

  const rowCx = "flex items-center grow font-medium text-sm min-w-0 h-7 px-1 gap-0.5 rounded-full";
  const clickAbleCx =
    "hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-ring";
  const activeCx = "bg-muted text-foreground";

  const handleClick: MouseEventHandler<HTMLAnchorElement> = (event) => {
    if (!onClick) return;
    event.preventDefault();
    event.stopPropagation();
    onClick(node);
  };

  return (
    <div className={twMerge(rowCx, className, "px-0")}>
      {onToggleSelect && isSelected && node.type === "file" && (
        <Checkbox isSelected={isSelected(node)} onChange={() => onToggleSelect(node)} />
      )}
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
    </div>
  );
}

function NodeLinkWithMenu({
  node,
  onClick,
  contextMenuItems,
  isClickable = () => true,
  className,
  isSelected,
  onToggleSelect,
  onContextMenuTarget,
}: NodeLinkProps) {
  const to = buildConnectionPath(node.connectionId, node.pathName);
  const isCurrent = Boolean(useMatch({ path: to, end: true }));
  const clickable = isClickable(node) && !isCurrent;

  const ctx = useNodeContextMenu({ node, isCurrent, extraItems: contextMenuItems });

  // Lift right-click handler to parent's ref (no state round-trip).
  onContextMenuTarget?.(ctx?.targetProps.onContextMenu ?? null);

  const rowCx = "flex items-center grow font-medium text-sm min-w-0 h-7 px-1 gap-0.5 rounded-full";
  const clickAbleCx =
    "hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-ring";
  const activeCx = "bg-muted text-foreground";

  // When parent owns right-click, don't add `group` — parent's group controls hover.
  const containerCx = onContextMenuTarget ? "relative" : "group relative";

  const handleClick: MouseEventHandler<HTMLAnchorElement> = (event) => {
    if (!onClick) return;
    event.preventDefault();
    event.stopPropagation();
    onClick(node);
  };

  // Spread targetProps on the row when parent doesn't own them
  const targetProps = onContextMenuTarget ? {} : (ctx?.targetProps ?? {});

  return (
    <div className={twMerge(containerCx, rowCx, className, "px-0")}>
      {onToggleSelect && isSelected && node.type === "file" && (
        <Checkbox isSelected={isSelected(node)} onChange={() => onToggleSelect(node)} />
      )}
      {clickable ? (
        <NavLink
          to={to}
          end
          className={({ isActive }) => twMerge(rowCx, clickAbleCx, isActive && activeCx)}
          onClick={handleClick}
          {...targetProps}
        >
          <NodeIndicator node={node} />
          <TruncatedText>{node.name}</TruncatedText>
        </NavLink>
      ) : (
        <div className={twMerge(rowCx, isCurrent && activeCx)} {...targetProps}>
          <NodeIndicator node={node} />
          <TruncatedText>{node.name}</TruncatedText>
        </div>
      )}

      {ctx && (
        <div className="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
          {ctx.kebab}
        </div>
      )}
      {ctx?.menu}
    </div>
  );
}
