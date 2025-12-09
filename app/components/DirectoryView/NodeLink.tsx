import { PointerEventHandler, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { twMerge } from "tailwind-merge";

import { useDirectoryStore } from "./useDirectoryStore";
import { ImagePreview } from "../.client/ImageViewer/components/Image/ImagePreview";
import { ViewerStoreProvider } from "../.client/ImageViewer/state/ViewerStoreContext";
import { Icon, IconButton, LucideIconsType } from "../Controls/IconButton";
import { TooltipSpan } from "../Tooltip/TooltipSpan";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { createResourceId } from "~/utils/resourceId";

const icons: Record<string, LucideIconsType> = {
  directory: "Folder",
  file: "File",
  bucket: "Archive",
};

function NodeLinkIcon({ node }: { node: TreeNode }) {
  return (
    <div className={"flex items-center justify-center"}>
      <Icon icon={icons[node.type]} />
    </div>
  );
}

const Sheet = ({
  children,
  offset,
}: {
  offset: number;
  children?: React.ReactNode;
}) => {
  const cx = twMerge(
    `
    absolute top-${offset} left-${offset} right-${4 - offset} bottom-${4 - offset}
    bg-black 
    border border-white
  `,
    `top-${offset}`,
    `left-${offset}`,
    `right-${4 - offset}`,
    `bottom-${4 - offset}`
  );
  return <div className={cx}>{children}</div>;
};

function NodeThumbnail({ node }: { node: TreeNode }) {
  const { provider, bucketName } = useDirectoryStore();

  const key = node._Object?.Key;
  const resourceId =
    key && provider && bucketName
      ? createResourceId(provider, bucketName, key)
      : "";
  const url = node._Object?.presignedUrl;

  if (url) {
    if (node.type === "directory") {
      return (
        <div className="relative w-full h-full">
          <Sheet offset={4} />
          <Sheet offset={2} />
          <Sheet offset={0}>
            {key?.endsWith("ome.tif") && (
              <ViewerStoreProvider resourceId={resourceId} url={url}>
                <ImagePreview />
              </ViewerStoreProvider>
            )}
          </Sheet>

          <div
            className={`
              absolute top-2 right-6
              flex items-center justify-center
              px-1 h-4 min-w-4
              text-sm font-bold
            text-slate-700 bg-white
          `}
          >
            {node.children.length}
          </div>
        </div>
      );
    }

    if (key?.endsWith("ome.tif")) {
      return (
        <ViewerStoreProvider resourceId={resourceId} url={url}>
          <ImagePreview />
        </ViewerStoreProvider>
      );
    }

    if (key?.endsWith("csv")) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-100">
          <Icon icon="Table2" size={96} />
        </div>
      );
    }
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-100">
      <Icon icon="Cloud" size={96} />
    </div>
  );
}

export interface NodeLinkProps {
  node: TreeNode;
  listStyle?: "list" | "grid";
  className?: string;
  onClick?: (node: TreeNode) => void;
}

export default function NodeLink({
  node,
  listStyle = "list",
  className,
  onClick,
}: NodeLinkProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { provider: storeProvider } = useDirectoryStore();

  const nodeType = node.type;
  const pathName = node.pathName;
  const bucketName = node.bucketName;
  // Use provider from node._Bucket for bucket nodes, or from store for files/directories
  const provider = node._Bucket?.provider ?? storeProvider;

  const resourceId = createResourceId(
    provider!,
    bucketName,
    pathName
  );

  const to = `/buckets/${resourceId}`;

  // Open Info Modal
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
    [resourceId, location.pathname, location.search, navigate, nodeType]
  );

  // Merge class names
  const cx = twMerge(
    `
      flex flex-row flex-grow items-center
      h-full min-w-0 gap-2
      text-blue-700 hover:text-blue-500
    `,
    className
  );

  return (
    <div>
      {listStyle === "grid" && (
        <Link to={to} className="block h-40 ">
          <NodeThumbnail node={node} />
        </Link>
      )}

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
