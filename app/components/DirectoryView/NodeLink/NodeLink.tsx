import { PointerEventHandler, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { twMerge } from "tailwind-merge";

import { NodeLinkIcon } from "./NodeLinkIcon";
import { NodeThumbnail } from "./NodeThumbnail";
import { IconButton } from "../../Controls";
import { TooltipSpan } from "../../Tooltip/TooltipSpan";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { type GridSize } from "~/components/DirectoryView/DirectoryViewGrid";
import { createResourceId } from "~/utils/resourceId";

export type NodeLinkListStyle = "list" | "grid";

export interface NodeLinkProps {
  node: TreeNode;
  listStyle?: NodeLinkListStyle;
  gridSize?: GridSize;
  className?: string;
  onClick?: (node: TreeNode) => void;
  showInfoButton?: boolean;
}

const style = `
  flex flex-row flex-grow items-center
  h-full min-w-0 gap-1
  text-cytario-turquoise-700 hover:text-cytario-turquoise-900
  group-hover:underline
`;

export function NodeLink({
  node,
  listStyle = "list",
  gridSize,
  className,
  onClick,
  showInfoButton = true,
}: NodeLinkProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const nodeType = node.type;
  const resourceId = createResourceId(
    node.provider,
    node.bucketName,
    node.pathName,
  );

  // Strip trailing slash from URL to ensure consistent routing (breadcrumb matching)
  const to = `/buckets/${resourceId}`.replace(/\/$/, "");

  // Open info modal
  const openNodeInfoModal: PointerEventHandler = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      const search = new URLSearchParams(location.search);
      search.set(nodeType, resourceId);

      navigate({
        pathname: location.pathname,
        search: `?${search.toString()}`,
      });
    },
    [resourceId, location.pathname, location.search, navigate, nodeType],
  );

  // Merge class names
  const cx = twMerge(style, className);

  return (
    <div className="group flex flex-col h-full">
      {/* Grid view thumbnail */}
      {listStyle === "grid" && (
        <Link to={to} className="flex items-center justify-center w-full flex-1 min-h-0">
          <NodeThumbnail node={node} gridSize={gridSize} />
        </Link>
      )}

      {/* Node name */}
      <div className="w-full flex items-center gap-1 min-h-8">
        <Link
          to={to}
          className={cx}
          onClick={(event) => {
            if (onClick) {
              event.preventDefault();
              event.stopPropagation();
              onClick(node);
            }
          }}
        >
          <NodeLinkIcon node={node} />
          <TooltipSpan>{node.name}</TooltipSpan>
        </Link>

        {/* Context menu */}
        {showInfoButton && (
          <IconButton
            icon="Info"
            label="Show Info"
            onClick={openNodeInfoModal}
            theme="transparent"
            className="border-none text-slate-500"
          />
        )}
      </div>

    </div>
  );
}
