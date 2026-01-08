import { ReactNode } from "react";
import { Link } from "react-router";
import { twMerge } from "tailwind-merge";

import { ThumbnailSheets } from "./Sheet";
import { ImagePreview } from "~/components/.client/ImageViewer/components/Image/ImagePreview";
import { ViewerStoreProvider } from "~/components/.client/ImageViewer/state/ViewerStoreContext";
import { Icon } from "~/components/Controls/IconButton";
import {
  TreeNode,
  TreeNodeType,
} from "~/components/DirectoryView/buildDirectoryTree";
import { parseResourceId } from "~/utils/resourceId";
import { usePresignedUrl } from "~/utils/usePresignedUrl";

const ThumbnailBox = ({ children }: { children?: ReactNode }) => {
  const style = `
    absolute right-0 bottom-0 left-0 top-0
    bg-black border border-white
    origin-top-left
  `;
  return (
    <div className="relative w-full h-full">
      <div className={twMerge(style, "right-4 h-4 skew-x-[45deg]")} />
      <div className={twMerge(style, "bottom-4 w-4 skew-y-[45deg]")} />
      <div className={twMerge(style, "top-4 left-4")}>{children}</div>
    </div>
  );
};

const ThumbnailFile = ({ children }: { children?: ReactNode }) => {
  return (
    <div className="relative w-full h-full bg-black border border-white">
      {children}
      <svg
        viewBox="0 0 16 16"
        className="absolute top-0 right-0 w-4 h-4 bg-white fill-black stroke-white stroke-4"
      >
        <polygon points="0,0 0,16 16,16" strokeWidth={2} />
      </svg>
    </div>
  );
};

export function NodeThumbnail({ node }: { node: TreeNode }) {
  const { provider, bucketName } = parseResourceId(node.id);
  const pathName = node._Object?.Key;
  const nodeId = [provider, bucketName, pathName].join("/");
  const { url } = usePresignedUrl(nodeId);

  switch (node.type) {
    case "bucket":
      return <ThumbnailBox></ThumbnailBox>;
    case "directory":
      return (
        <ThumbnailSheets count={node.children.length}>
          {url && nodeId.endsWith("ome.tif") && (
            <ViewerStoreProvider resourceId={nodeId} url={url}>
              <ImagePreview />
            </ViewerStoreProvider>
          )}
        </ThumbnailSheets>
      );
    case "file":
    default:
      return (
        <ThumbnailFile>
          {url && nodeId.endsWith("ome.tif") && (
            <ViewerStoreProvider resourceId={nodeId} url={url}>
              <ImagePreview />
            </ViewerStoreProvider>
          )}
        </ThumbnailFile>
      );
  }
}
