import { FileCard, StorageConnectionCard } from "@cytario/design";
import { filesize } from "filesize";
import { lazy, Suspense, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";

import { type TreeNode } from "./buildDirectoryTree";
import { ConnectionMenu } from "./ConnectionMenu";
import { type DirectoryKind } from "./DirectoryView";
import { DirectoryViewEmptyState } from "./DirectoryViewEmptyState";
import { type ViewMode } from "./useLayoutStore";
import { ClientOnly } from "~/components/ClientOnly";
import { ProviderPill } from "~/components/Pills/ProviderPill";
import { ScopePill } from "~/components/Pills/ScopePill";
import { useNodeInfoModal } from "~/hooks/useNodeInfoModal";
import {
  select,
  selectHttpsUrl,
} from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { getNodeIcon, isImageFile } from "~/utils/fileType";
import { buildConnectionPath, constructS3Url } from "~/utils/resourceId";
import { createSignedFetch } from "~/utils/signedFetch";

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
  const connectionConfig = useConnectionsStore(
    select.connectionConfig(connectionName),
  );

  const signedFetch = useMemo(() => {
    if (!connectionConfig) return null;
    return createSignedFetch(
      () =>
        useConnectionsStore.getState().connections[connectionName]?.credentials,
      connectionConfig,
    );
  }, [connectionName, connectionConfig]);

  return { connectionConfig, signedFetch };
}

function BucketCardGridItem({
  node,
  connectionName,
}: {
  node: TreeNode;
  connectionName: string;
}) {
  const navigate = useNavigate();
  const { connectionConfig, signedFetch } = useSignedFetch(connectionName);

  const to = buildConnectionPath(connectionName, node.pathName);
  const handlePress = useCallback(() => navigate(to), [navigate, to]);

  // Bucket nodes carry the first-image key from the connections loader on
  // `_Object.Key` (already absolute — includes any configured prefix).
  const previewKey = node._Object?.Key ?? null;
  const hasPreview = !!previewKey && isImageFile(previewKey) && !!signedFetch;
  const s3Url =
    hasPreview && connectionConfig
      ? constructS3Url(connectionConfig, previewKey)
      : "";

  return (
    <StorageConnectionCard
      name={node.name}
      // TODO(C-151): hardcoded — not reflecting real connection state.
      // Needs real semantics (credential hydration, reachability, index status).
      status="connected"
      meta={
        connectionConfig && (
          <>
            <ScopePill scope={connectionConfig.ownerScope} />
            <ProviderPill provider={connectionConfig.provider} />
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

  const { connectionConfig: config, signedFetch } =
    useSignedFetch(connectionName);
  // `_Object.Key` is absolute (prefix already applied) and set for both file
  // nodes (from listing) and directory nodes (first image inside, via
  // buildDirectoryTree). File nodes without `_Object` — e.g. recently-viewed
  // entries reconstructed from DB — fall back to the resolver URL for the
  // node's own resourceId.
  const explicitKey = node._Object?.Key ?? null;
  const resolvedHttpsUrl = useConnectionsStore(selectHttpsUrl(node.id));

  const to = buildConnectionPath(connectionName, node.pathName);
  const handlePress = useCallback(() => navigate(to), [navigate, to]);

  const s3Url =
    explicitKey && isImageFile(explicitKey) && config
      ? constructS3Url(config, explicitKey)
      : isImageFile(node.name)
        ? (resolvedHttpsUrl ?? "")
        : "";
  const hasPreview = !!s3Url && !!signedFetch;

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
          return (
            <BucketCardGridItem
              key={key}
              node={node}
              connectionName={node.connectionName}
            />
          );
        }
        return (
          <FileCardGridItem
            key={key}
            node={node}
            compact={compact}
            connectionName={node.connectionName}
          />
        );
      })}
    </div>
  );
}
