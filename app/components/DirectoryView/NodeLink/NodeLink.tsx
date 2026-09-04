import { Checkbox, TruncatedText, IconButton } from "@cytario/design";
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

const ROW_CX = `
  flex items-center grow
  font-medium text-sm
  min-w-0 h-7
  rounded-full
  gap-1
  px-1 group-hover:pe-7 group-focus-within:pe-7

  [transition:padding-inline-end_150ms_0ms,background-color_150ms_0ms,color_150ms_0ms]
  hover:[transition:padding-inline-end_150ms_300ms,background-color_150ms_0ms,color_150ms_0ms]
  focus-within:[transition:padding-inline-end_150ms_300ms,background-color_150ms_0ms,color_150ms_0ms]
`;

const FOCUS_CX = `
  focus-visible:outline-none
  focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
`;

const CLICKABLE_CX = `
  hover:bg-muted
  hover:text-foreground
  ${FOCUS_CX}
`;

const ACTIVE_CX = `bg-muted text-foreground ${FOCUS_CX}`;

export function NodeLink({
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

  // When parent owns right-click, don't add `group` — parent's group controls hover.
  const containerCx = onContextMenuTarget ? "" : "group ";

  const targetProps = onContextMenuTarget ? {} : (ctx?.targetProps ?? {});

  const handleClick: MouseEventHandler<HTMLAnchorElement> = (event) => {
    if (!onClick) return;
    event.preventDefault();
    event.stopPropagation();
    onClick(node);
  };

  return (
    <div className={twMerge(containerCx, "flex items-center grow min-w-0 relative", className)}>
      {onToggleSelect && isSelected && node.type === "file" && (
        <Checkbox isSelected={isSelected(node)} onChange={() => onToggleSelect(node)} />
      )}

      {clickable ? (
        <NavLink
          to={to}
          end
          className={twMerge(ROW_CX, CLICKABLE_CX, isCurrent && ACTIVE_CX)}
          onClick={handleClick}
          {...targetProps}
        >
          <NodeIndicator node={node} />
          <TruncatedText>{node.name}</TruncatedText>
        </NavLink>
      ) : (
        <div className={twMerge(ROW_CX, isCurrent && ACTIVE_CX)} {...targetProps}>
          <NodeIndicator node={node} />
          <TruncatedText>{node.name}</TruncatedText>
        </div>
      )}

      {ctx && (
        <IconButton
          icon="EllipsisVertical"
          label={`Actions for ${node.name}`}
          size="xs"
          variant="neutral"
          className={`
            absolute right-0 top-0
            opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
            transition-opacity delay-0 group-hover:delay-200
          `}
          {...ctx.triggerProps}
        />
      )}

      {ctx?.menu}
    </div>
  );
}
