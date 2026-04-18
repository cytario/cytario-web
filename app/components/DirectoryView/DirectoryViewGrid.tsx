import { FileCard, StorageConnectionCard } from "@cytario/design";
import { filesize } from "filesize";
import { lazy, Suspense, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";

import { TreeNode } from "./buildDirectoryTree";
import { ConnectionMenu } from "./ConnectionMenu";
import type { DirectoryKind } from "./DirectoryView";
import { DirectoryViewEmptyState } from "./DirectoryViewEmptyState";
import { type ViewMode } from "./useLayoutStore";
import { ClientOnly } from "~/components/ClientOnly";
import { ProviderPill } from "~/components/Pills/ProviderPill";
import { ScopePill } from "~/components/Pills/ScopePill";
import { useNodeInfoModal } from "~/hooks/useNodeInfoModal";
import { useConnectionsStore } from "~/utils/connectionsStore";
import { selectConnection } from "~/utils/connectionsStore/selectors";
import { getNodeIcon, isImageFile } from "~/utils/fileType";
import { buildConnectionPath } from "~/utils/resourceId";
import { createSignedFetch } from "~/utils/signedFetch";
import { constructS3Url } from "~/utils/zarrUtils";

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

/** Create a signedFetch that lazily resolves credentials from the connections store. */
function useSignedFetch(connectionName: string) {
  const connection = useConnectionsStore(selectConnection(connectionName));
  const config = connection?.connectionConfig;

  const signedFetch = useMemo(() => {
    if (!config) return null;
    return createSignedFetch(
      () => useConnectionsStore.getState().connections[connectionName]?.credentials,
      config,
    );
  }, [connectionName, config]);

  return { connection, signedFetch };
}

function BucketCardGridItem({ node, connectionName }: { node: TreeNode; connectionName: string }) {
  const navigate = useNavigate();
  const { connection, signedFetch } = useSignedFetch(connectionName);

  const to = buildConnectionPath(connectionName, node.pathName);
  const handlePress = useCallback(() => navigate(to), [navigate, to]);

  const key = node._Object?.Key;
  const hasPreview = !!key && isImageFile(key) && !!signedFetch;
  const s3Url = hasPreview && connection?.connectionConfig
    ? constructS3Url(connection.connectionConfig, key)
    : "";

  return (
    <StorageConnectionCard
      name={node.name}
      // TODO(C-151): hardcoded — not reflecting real connection state.
      // Needs real semantics (credential hydration, reachability, index status).
      status="connected"
      meta={
        connection?.connectionConfig && (
          <>
            <ScopePill scope={connection.connectionConfig.ownerScope} />
            <ProviderPill provider={connection.connectionConfig.provider} />
          </>
        )
      }
      onPress={handlePress}
      actions={<ConnectionMenu connectionName={node.name} />}
    >
      {hasPreview && signedFetch && (
        <ClientOnly>
          <Suspense
            fallback={
              <div className="animate-pulse w-full h-full bg-slate-600" />
            }
          >
            <ViewerStoreProvider url={s3Url} signedFetch={signedFetch}>
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
  connectionName,
}: {
  node: TreeNode;
  compact: boolean;
  connectionName: string;
}) {
  const navigate = useNavigate();
  const handleInfo = useNodeInfoModal(node);
  const { connection, signedFetch } = useSignedFetch(connectionName);

  const to = buildConnectionPath(connectionName, node.pathName);
  const handlePress = useCallback(() => navigate(to), [navigate, to]);

  // For files: use the node's own path. For directories: use the first image found inside.
  const previewKey = node._Object?.Key;
  const isPreviewable = isImageFile(node.name) || (!!previewKey && isImageFile(previewKey));
  const hasPreview = isPreviewable && !!signedFetch;
  const previewPath = isImageFile(node.name)
    ? node.pathName.replace(/\/$/, "")
    : previewKey ?? "";
  const s3Url = hasPreview && connection?.connectionConfig
    ? constructS3Url(connection.connectionConfig, previewPath)
    : "";

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
      {hasPreview && signedFetch && (
        <ClientOnly>
          <Suspense
            fallback={
              <div className="animate-pulse w-full h-full bg-slate-600" />
            }
          >
            <ViewerStoreProvider url={s3Url} signedFetch={signedFetch}>
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
  kind,
}: {
  nodes: TreeNode[];
  viewMode?: ViewMode;
  kind: DirectoryKind;
}) {
  if (nodes.length === 0) return <DirectoryViewEmptyState kind={kind} />;

  const compact = viewMode === "grid-compact";
  const gridClass = gridClasses[viewMode] ?? gridClasses["grid"];

  return (
    <div className={gridClass}>
      {nodes.map((node) => {
        const key = node.id;
        if (kind === "connections") {
          return <BucketCardGridItem key={key} node={node} connectionName={node.connectionName} />;
        }
        return <FileCardGridItem key={key} node={node} compact={compact} connectionName={node.connectionName} />;
      })}
    </div>
  );
}
