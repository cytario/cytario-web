import { lazy, Suspense } from "react";

import { ThumbnailBox } from "./ThumbnailBox";
import { ThumbnailFile } from "./ThumbnailFile";
import { ThumbnailSheets } from "./ThumbnailSheets";
import { ClientOnly } from "~/components/ClientOnly";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { createResourceId } from "~/utils/resourceId";

// Lazy-load client-only components to prevent SSR crashes.
// .client/ imports are stubbed to undefined on the server.
const ViewerStoreProvider = lazy(() =>
  import("~/components/.client/ImageViewer/state/ViewerStoreContext").then(
    (mod) => ({ default: mod.ViewerStoreProvider }),
  ),
);
const ImagePreview = lazy(() =>
  import("~/components/.client/ImageViewer/components/Image/ImagePreview").then(
    (mod) => ({ default: mod.ImagePreview }),
  ),
);

export function NodeThumbnail({ node }: { node: TreeNode }) {
  const key = node._Object?.Key;
  const resourceId = key
    ? createResourceId(node.provider, node.bucketName, key)
    : "";
  const url = node._Object?.presignedUrl;

  if (!url) {
    // Return default thumbnails without image preview
    switch (node.type) {
      case "bucket":
        return <ThumbnailBox label={node.provider}></ThumbnailBox>;
      case "directory":
        return <ThumbnailSheets count={node.children?.length ?? 0} />;
      case "file":
      default:
        return <ThumbnailFile />;
    }
  }

  switch (node.type) {
    case "bucket":
      return <ThumbnailBox label={node.provider}></ThumbnailBox>;
    case "directory":
      return (
        <ThumbnailSheets count={node.children?.length ?? 0}>
          {key?.endsWith("ome.tif") && (
            <ClientOnly>
              <Suspense>
                <ViewerStoreProvider resourceId={resourceId} url={url}>
                  <ImagePreview />
                </ViewerStoreProvider>
              </Suspense>
            </ClientOnly>
          )}
        </ThumbnailSheets>
      );
    case "file":
    default:
      return (
        <ThumbnailFile>
          {key?.endsWith("ome.tif") && (
            <ClientOnly>
              <Suspense>
                <ViewerStoreProvider resourceId={resourceId} url={url}>
                  <ImagePreview />
                </ViewerStoreProvider>
              </Suspense>
            </ClientOnly>
          )}
        </ThumbnailFile>
      );
  }
}
