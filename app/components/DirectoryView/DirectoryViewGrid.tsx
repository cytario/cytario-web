import { FileCard, StorageConnectionCard } from "@cytario/design";
import { filesize } from "filesize";
import { lazy, Suspense, useCallback } from "react";
import { useNavigate } from "react-router";

import { TreeNode } from "./buildDirectoryTree";
import { ConnectionMenu } from "./ConnectionMenu";
import { type ViewMode } from "./useLayoutStore";
import { ClientOnly } from "~/components/ClientOnly";
import { ProviderPill } from "~/components/Pills/ProviderPill";
import { VisibilityPill } from "~/components/Pills/VisibilityPill";
import { useNodeInfoModal } from "~/hooks/useNodeInfoModal";
import { useConnectionsStore } from "~/utils/connectionsStore";
import { selectConnection } from "~/utils/connectionsStore/selectors";
import { getNodeIcon, isImageFile } from "~/utils/fileType";
import { nodeToPath } from "~/utils/resourceId";

const ViewerStoreProvider = lazy(() =>
  import("~/components/.client/ImageViewer/state/store/ViewerStoreContext").then(
    (mod) => ({ default: mod.ViewerStoreProvider }),
  ),
);
const ImagePreview = lazy(() =>
  import("~/components/.client/ImageViewer/components/Image/ImagePreview").then(
    (mod) => ({ default: mod.ImagePreview }),
  ),
);

const gridClasses: Partial<Record<ViewMode, string>> = {
  // prettier-ignore
  "grid-compact": "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3",
  grid: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6",
};

function BucketCardGridItem({ node }: { node: TreeNode }) {
  const navigate = useNavigate();
  const connection = useConnectionsStore(selectConnection(node.connectionName));

  const to = nodeToPath(node);
  const handlePress = useCallback(() => navigate(to), [navigate, to]);

  // Preview: check if the bucket's first image file can be previewed
  const key = node._Object?.Key;
  const hasPreview = !!key && isImageFile(key) && !!connection?.credentials;
  const pathName = key ?? "";

  return (
    <StorageConnectionCard
      name={node.name}
      status="connected"
      meta={
        connection?.connectionConfig && (
          <>
            <VisibilityPill scope={connection.connectionConfig.ownerScope} />
            <ProviderPill provider={connection.connectionConfig.provider} />
          </>
        )
      }
      onPress={handlePress}
      actions={<ConnectionMenu connectionName={node.name} />}
    >
      {hasPreview && connection && (
        <ClientOnly>
          <Suspense
            fallback={
              <div className="animate-pulse w-full h-full bg-slate-600" />
            }
          >
            <ViewerStoreProvider connection={connection} pathName={pathName}>
              <ImagePreview />
            </ViewerStoreProvider>
          </Suspense>
        </ClientOnly>
      )}
    </StorageConnectionCard>
  );
}

function FileCardGridItem({
  node,
  compact,
}: {
  node: TreeNode;
  compact: boolean;
}) {
  const navigate = useNavigate();
  const handleInfo = useNodeInfoModal(node);
  const connection = useConnectionsStore(selectConnection(node.connectionName));

  const to = nodeToPath(node);
  const handlePress = useCallback(() => navigate(to), [navigate, to]);

  // For files: pathName is the node's own path.
  // For directories: _Object.Key is the first image found inside — use it for preview.
  const previewKey = node._Object?.Key;
  const isPreviewable = isImageFile(node.name) || (!!previewKey && isImageFile(previewKey));
  const hasPreview = isPreviewable && !!connection?.credentials;
  const pathName = isImageFile(node.name)
    ? (node.pathName?.replace(/\/$/, "") ?? node.name)
    : previewKey ?? "";

  const nodeIcon = getNodeIcon(node);
  const size =
    node.type === "file" && node._Object?.Size
      ? filesize(node._Object.Size)
      : undefined;

  return (
    <FileCard
      name={node.name}
      icon={nodeIcon}
      size={typeof size === "string" ? size : undefined}
      compact={compact}
      onPress={handlePress}
      onInfo={handleInfo}
    >
      {hasPreview && connection && (
        <ClientOnly>
          <Suspense
            fallback={
              <div className="animate-pulse w-full h-full bg-slate-600" />
            }
          >
            <ViewerStoreProvider connection={connection} pathName={pathName}>
              <ImagePreview />
            </ViewerStoreProvider>
          </Suspense>
        </ClientOnly>
      )}
    </FileCard>
  );
}

export function DirectoryViewGrid({
  nodes,
  viewMode = "grid",
}: {
  nodes: TreeNode[];
  viewMode?: ViewMode;
}) {
  const compact = viewMode === "grid-compact";
  const gridClass = gridClasses[viewMode] ?? gridClasses["grid"];

  return (
    <div className={gridClass}>
      {nodes.map((node) => {
        const key = `${node.provider}/${node.bucketName}/${node.pathName ?? node.name}`;
        if (node.type === "bucket") {
          return <BucketCardGridItem key={key} node={node} />;
        }
        return <FileCardGridItem key={key} node={node} compact={compact} />;
      })}
    </div>
  );
}
