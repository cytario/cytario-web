import { filesize } from "filesize";
import { lazy, Suspense } from "react";

import { ThumbnailBox } from "./ThumbnailBox";
import { ThumbnailFile } from "./ThumbnailFile";
import { ThumbnailLabel, type ThumbnailMeta } from "./ThumbnailLabel";
import { ThumbnailSheets } from "./ThumbnailSheets";
import { ClientOnly } from "~/components/ClientOnly";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { type ViewMode } from "~/components/DirectoryView/useDirectoryStore";
import { useConnectionsStore } from "~/utils/connectionsStore";
import { formatShortDate } from "~/utils/formatHumanReadableDate";
import { isOmeTiff } from "~/utils/omeTiffOffsets";
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

const EMPTY_ARRAY: ThumbnailMeta[] = [];

function useNodeMetadata(node: TreeNode, viewMode?: ViewMode): ThumbnailMeta[] {
  const connections = useConnectionsStore((state) => state.connections);
  const getBucketConfig = (key: string) =>
    connections[key]?.bucketConfig ?? null;
  // const gridSize = viewMode ? getGridSize(viewMode) : undefined;

  switch (viewMode) {
    case "list":
    case "grid-sm":
      return EMPTY_ARRAY;
    case "grid-md":
    case "grid-lg":
    default: {
      const storeKey = `${node.provider}/${node.bucketName}`;
      const config = getBucketConfig(storeKey);
      if (!config) return EMPTY_ARRAY;

      switch (node.type) {
        case "bucket": {
          return [
            { key: "provider", value: config.provider },
            { key: "region", value: config.region ?? "" },
          ];
        }
        case "directory":
          return [
            //
            { key: "count", value: String(node.children?.length ?? 0) },
          ];
        case "file":
        default:
          return [
            { key: "size", value: filesize(node._Object?.Size ?? 0) },
            {
              key: "date",
              value: formatShortDate(node._Object?.LastModified ?? 0),
            },
          ];
      }
    }
  }
}

const thumbnailComponents = {
  bucket: ThumbnailBox,
  directory: ThumbnailSheets,
  file: ThumbnailFile,
};

export function NodeThumbnail({
  node,
  viewMode,
}: {
  node: TreeNode;
  viewMode?: ViewMode;
}) {
  const metadata = useNodeMetadata(node, viewMode);
  const key = node._Object?.Key;
  const url = node._Object?.presignedUrl;

  const imagePreview = url && key && isOmeTiff(key) && (
    <ClientOnly>
      <Suspense>
        <ViewerStoreProvider
          resourceId={createResourceId(node.provider, node.bucketName, key)}
          url={url}
        >
          <ImagePreview />
        </ViewerStoreProvider>
      </Suspense>
    </ClientOnly>
  );

  const Component = thumbnailComponents[node.type];

  return (
    <div className="relative w-full h-full">
      <Component>{imagePreview}</Component>
      <ThumbnailLabel metadata={metadata} />
    </div>
  );
}
