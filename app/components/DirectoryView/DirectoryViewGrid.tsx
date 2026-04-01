import { FileCard, StorageConnectionCard } from "@cytario/design";
import { filesize } from "filesize";
import { lazy, Suspense, useCallback } from "react";
import { useNavigate } from "react-router";

import { TreeNode } from "./buildDirectoryTree";
import { type ViewMode } from "./useLayoutStore";
import { ClientOnly } from "~/components/ClientOnly";
import { ProviderPill } from "~/components/Pills/ProviderPill";
import { VisibilityPill } from "~/components/Pills/VisibilityPill";
import { useNodeInfoModal } from "~/hooks/useNodeInfoModal";
import { useConnectionsStore } from "~/utils/connectionsStore";
import { getExtension } from "~/utils/fileType";
import { isOmeTiff } from "~/utils/omeTiffOffsets";
import { createResourceId, nodeToPath } from "~/utils/resourceId";

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

const gridClasses: Partial<Record<ViewMode, string>> = {
  // prettier-ignore
  "grid-compact": "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3",
  grid: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6",
};

function BucketCardGridItem({ node }: { node: TreeNode }) {
  const navigate = useNavigate();
  const handleInfo = useNodeInfoModal(node);
  const config = useConnectionsStore(
    (state) => state.connections[node.connectionName]?.connectionConfig,
  );

  const to = nodeToPath(node);

  const handlePress = useCallback(() => {
    navigate(to);
  }, [navigate, to]);

  const key = node._Object?.Key;
  const url = node._Object?.presignedUrl;
  const hasOmeTiffPreview = !!url && !!key && isOmeTiff(key);

  return (
    <StorageConnectionCard
      name={node.name}
      status="connected"
      meta={
        <>
          <VisibilityPill scope={config.ownerScope} />
          <ProviderPill provider={config.provider} />
        </>
      }
      onPress={handlePress}
      onInfo={handleInfo}
    >
      {hasOmeTiffPreview && (
        <ClientOnly>
          <Suspense
            fallback={
              <div className="animate-pulse w-full h-full bg-slate-600" />
            }
          >
            <ViewerStoreProvider
              resourceId={createResourceId(node.provider, node.bucketName, key)}
              url={url}
            >
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

  const resourceId = createResourceId(
    node.provider,
    node.bucketName,
    node._Object?.Key ?? node.pathName,
  );
  const to = nodeToPath(node);

  const handlePress = useCallback(() => {
    navigate(to);
  }, [navigate, to]);

  const cardType = node.type === "file" ? "file" : "directory";
  const extension = node.type === "file" ? getExtension(node.name) : undefined;
  const size =
    node.type === "file" && node._Object?.Size
      ? filesize(node._Object.Size)
      : undefined;

  const key = node._Object?.Key;
  const url = node._Object?.presignedUrl;
  const hasOmeTiffPreview = !!url && !!key && isOmeTiff(key);

  return (
    <FileCard
      name={node.name}
      type={cardType}
      extension={extension}
      size={typeof size === "string" ? size : undefined}
      compact={compact}
      onPress={handlePress}
      onInfo={handleInfo}
    >
      {hasOmeTiffPreview && (
        <ClientOnly>
          <Suspense
            fallback={
              <div className="animate-pulse w-full h-full bg-slate-600" />
            }
          >
            <ViewerStoreProvider resourceId={resourceId} url={url}>
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
