import { ThumbnailBox } from "./ThumbnailBox";
import { ThumbnailFile } from "./ThumbnailFile";
import { ThumbnailSheets } from "./ThumbnailSheets";
import { ImagePreview } from "~/components/.client/ImageViewer/components/Image/ImagePreview";
import { ViewerStoreProvider } from "~/components/.client/ImageViewer/state/ViewerStoreContext";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { parseResourceId } from "~/utils/resourceId";
import { usePresignedUrl } from "~/utils/usePresignedUrl";

export function NodeThumbnail({ node }: { node: TreeNode }) {
  const { provider, bucketName } = parseResourceId(node.id);
  const pathName = node._Object?.Key;
  const nodeId = [provider, bucketName, pathName].join("/");
  const { url } = usePresignedUrl(nodeId);

  switch (node.type) {
    case "bucket":
      return <ThumbnailBox label={provider}></ThumbnailBox>;
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
