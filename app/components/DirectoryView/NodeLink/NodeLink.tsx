import { PointerEventHandler, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { twMerge } from "tailwind-merge";

import { NodeLinkIcon } from "./NodeLinkIcon";
import { NodeThumbnail } from "./NodeThumbnail";
import { IconButton } from "../../Controls/IconButton";
import { TooltipSpan } from "../../Tooltip/TooltipSpan";
import { ImagePreview } from "~/components/.client/ImageViewer/components/Image/ImagePreview";
import { ViewerStoreProvider } from "~/components/.client/ImageViewer/state/ViewerStoreContext";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { usePresignedUrl } from "~/utils/usePresignedUrl";

export interface NodeLinkProps {
  node: TreeNode;
  listStyle?: "list" | "grid";
  className?: string;
  onClick?: (node: TreeNode) => void;
}

const style = `
  flex flex-row flex-grow items-center
  h-full min-w-0 gap-2
  text-blue-700 hover:text-blue-500
`;

export default function NodeLink({
  node,
  listStyle = "list",
  className,
  onClick,
}: NodeLinkProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const nodeType = node.type;
  const nodeId = node.id;
  const to = `/buckets/${nodeId}`;

  // Open info modal
  const openNodeInfoModal: PointerEventHandler = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      const search = new URLSearchParams(location.search);
      search.set(nodeType, nodeId);

      navigate({
        pathname: location.pathname,
        search: `?${search.toString()}`,
      });
    },
    [nodeId, location.pathname, location.search, navigate, nodeType]
  );

  // Merge class names
  const cx = twMerge(style, className);

  return (
    <div>
      {/* Grid view thumbnail */}
      {listStyle === "grid" && (
        <Link
          to={to}
          className="flex items-center justify-center w-full h-40"
          onPointerEnter={() => console.log(node)}
        >
          <NodeThumbnail node={node} />
        </Link>
      )}

      {/* Node name */}
      <div className="w-full flex flex-grow items-center gap-1">
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
        <IconButton
          icon="Info"
          label="Show Info"
          onClick={openNodeInfoModal}
          theme="transparent"
          className="border-none stroke-slate-300"
        />
      </div>
    </div>
  );
}
