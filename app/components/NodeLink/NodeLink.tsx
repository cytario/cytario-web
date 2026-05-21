import { IconButton } from "@cytario/design";
import { Info } from "lucide-react";
import { type KeyboardEventHandler, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import { twMerge } from "tailwind-merge";

import { NodeIcon } from "./NodeIcon";
import { NodeStatusDot } from "./NodeStatusDot";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { ConnectionMenu } from "~/components/DirectoryView/ConnectionMenu";
import { TooltipSpan } from "~/components/Tooltip/TooltipSpan";
import { useNodeInfoModal } from "~/hooks/useNodeInfoModal";
import { buildConnectionPath } from "~/utils/resourceId";

export interface NodeLinkProps {
  node: TreeNode;
  onClick?: (node: TreeNode) => void;
  contextMenu?: boolean;
  className?: string;
}

/**
 * Single visual representation of a `TreeNode` shared across list, grid and
 * tree views. Renders an appropriate leading visual (connection status dot for
 * buckets, file-type icon otherwise), the node name, and an optional trailing
 * context menu trigger.
 */
export function NodeLink({ node, onClick, contextMenu = true, className }: NodeLinkProps) {
  const navigate = useNavigate();
  const openInfo = useNodeInfoModal(node);
  const to = buildConnectionPath(node.connectionName, node.pathName);

  const handleKeyDown: KeyboardEventHandler = useCallback(
    (event) => {
      if (event.key !== " ") return;
      event.preventDefault();
      if (onClick) onClick(node);
      else navigate(to);
    },
    [navigate, to, onClick, node],
  );

  const isBucket = node.type === "bucket";

  const cx = `
    flex items-center gap-2 min-w-0 grow
    text-(--color-text-primary) hover:underline
    focus-visible:outline-2 focus-visible:outline-(--color-border-focus)
    rounded-sm
  `;

  return (
    <div className={twMerge("flex items-center gap-2 min-w-0", className, "bg-rose-400")}>
      <Link
        to={to}
        onKeyDown={handleKeyDown}
        onClick={(event) => {
          if (!onClick) return;
          event.preventDefault();
          event.stopPropagation();
          onClick(node);
        }}
        className={cx}
      >
        {isBucket ? (
          <NodeStatusDot
            status={node.connectionStatus ?? "loading"}
            errorMessage={node.connectionErrorMessage}
          />
        ) : (
          <NodeIcon node={node} />
        )}
        <TooltipSpan>{node.name}</TooltipSpan>
      </Link>

      {contextMenu &&
        (isBucket ? (
          <ConnectionMenu connectionName={node.name} />
        ) : (
          <IconButton
            icon={Info}
            aria-label={`Show info for ${node.name}`}
            onPress={openInfo}
            variant="ghost"
            size="sm"
          />
        ))}
    </div>
  );
}
