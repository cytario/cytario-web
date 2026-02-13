import { filesize } from "filesize";
import { lazy, Suspense } from "react";

import { ThumbnailBox } from "./ThumbnailBox";
import { ThumbnailFile } from "./ThumbnailFile";
import { type ThumbnailMeta } from "./ThumbnailLabel";
import { ThumbnailSheets } from "./ThumbnailSheets";
import { ClientOnly } from "~/components/ClientOnly";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { type GridSize } from "~/components/DirectoryView/DirectoryViewGrid";
import { useCredentialsStore } from "~/utils/credentialsStore/useCredentialsStore";
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

function useNodeMetadata(
  node: TreeNode,
  gridSize?: GridSize,
): ThumbnailMeta[] {
  const getBucketConfig = useCredentialsStore((state) => state.getBucketConfig);

  if (!gridSize || gridSize === "sm") {
    // sm: keep legacy single-value labels
    switch (node.type) {
      case "bucket":
        return [];
      case "directory":
        return [{ key: "count", value: String(node.children?.length ?? 0) }];
      default:
        return [];
    }
  }

  const maxEntries = gridSize === "md" ? 2 : Infinity;

  switch (node.type) {
    case "bucket": {
      const storeKey = `${node.provider}/${node.bucketName}`;
      const config = getBucketConfig(storeKey);
      return [
        { key: "provider", value: config?.provider ?? node.provider },
        config?.endpoint ? { key: "endpoint", value: config.endpoint } : null,
        config?.region ? { key: "region", value: config.region } : null,
        config?.roleArn ? { key: "roleArn", value: config.roleArn } : null,
      ]
        .filter((e): e is ThumbnailMeta => e !== null)
        .slice(0, maxEntries);
    }
    case "directory":
      return [{ key: "count", value: String(node.children?.length ?? 0) }];
    case "file": {
      const obj = node._Object;
      if (!obj) return [];
      return [
        obj.Size != null
          ? { key: "size", value: filesize(obj.Size).toString() }
          : null,
        obj.LastModified
          ? { key: "modified", value: formatShortDate(obj.LastModified) }
          : null,
      ]
        .filter((e): e is ThumbnailMeta => e !== null)
        .slice(0, maxEntries);
    }
  }
}

export function NodeThumbnail({
  node,
  gridSize,
}: {
  node: TreeNode;
  gridSize?: GridSize;
}) {
  const metadata = useNodeMetadata(node, gridSize);
  const key = node._Object?.Key;
  const resourceId = key
    ? createResourceId(node.provider, node.bucketName, key)
    : "";
  const url = node._Object?.presignedUrl;

  const imagePreview = url && key && isOmeTiff(key) && (
    <ClientOnly>
      <Suspense>
        <ViewerStoreProvider resourceId={resourceId} url={url}>
          <ImagePreview />
        </ViewerStoreProvider>
      </Suspense>
    </ClientOnly>
  );

  switch (node.type) {
    case "bucket":
      return (
        <ThumbnailBox metadata={metadata}>{imagePreview}</ThumbnailBox>
      );
    case "directory":
      return (
        <ThumbnailSheets metadata={metadata}>{imagePreview}</ThumbnailSheets>
      );
    case "file":
    default:
      return (
        <ThumbnailFile metadata={metadata}>{imagePreview}</ThumbnailFile>
      );
  }
}
