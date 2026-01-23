import { ThumbnailBox } from "./ThumbnailBox";
import { ThumbnailFile } from "./ThumbnailFile";
import { ThumbnailSheets } from "./ThumbnailSheets";
import { useDirectoryStore } from "../useDirectoryStore";
import { ImagePreview } from "~/components/.client/ImageViewer/components/Image/ImagePreview";
import { ViewerStoreProvider } from "~/components/.client/ImageViewer/state/ViewerStoreContext";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { createResourceId } from "~/utils/resourceId";

export function NodeThumbnail({ node }: { node: TreeNode }) {
  const { provider, bucketName } = useDirectoryStore();

  const key = node._Object?.Key;
  const resourceId =
    key && provider && bucketName
      ? createResourceId(provider, bucketName, key)
      : "";
  const url = node._Object?.presignedUrl;

  if (!url) {
    // Return default thumbnails without image preview
    switch (node.type) {
      case "bucket":
        return <ThumbnailBox label={provider}></ThumbnailBox>;
      case "directory":
        return <ThumbnailSheets count={node.children?.length ?? 0} />;
      case "file":
      default:
        return <ThumbnailFile />;
    }
  }

  switch (node.type) {
    case "bucket":
      return <ThumbnailBox label={provider}></ThumbnailBox>;
    case "directory":
      return (
        <ThumbnailSheets count={node.children?.length ?? 0}>
          {key?.endsWith("ome.tif") && (
            <ViewerStoreProvider resourceId={resourceId} url={url}>
              <ImagePreview />
            </ViewerStoreProvider>
          )}
        </ThumbnailSheets>
      );
    case "file":
    default:
      return (
        <ThumbnailFile>
          {key?.endsWith("ome.tif") && (
            <ViewerStoreProvider resourceId={resourceId} url={url}>
              <ImagePreview />
            </ViewerStoreProvider>
          )}
        </ThumbnailFile>
      );
  }
}
