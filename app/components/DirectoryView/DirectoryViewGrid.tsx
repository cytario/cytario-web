import type { _Object } from "@aws-sdk/client-s3";
import { Badge } from "@cytario/design";
import { filesize } from "filesize";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { type TreeNode } from "./buildDirectoryTree";
import { type DirectoryKind } from "./DirectoryView";
import { DirectoryViewEmptyState } from "./DirectoryViewEmptyState";
import { ClientOnly } from "~/components/ClientOnly";
import { GridItem } from "~/components/DirectoryView/GridItem";
import { BucketPolicyStatusPill } from "~/components/Pills/BucketPolicyStatusPill";
import { liveCredentials, select, selectHttpsUrl } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { enrichDirectoryPreviews } from "~/utils/enrichDirectoryPreviews";
import { isImageFile } from "~/utils/fileType";
import { createSignedFetch } from "~/utils/signedFetch";

const ViewerStoreProvider = lazy(() =>
  import("~/components/.client/ImageViewer/state/store/ViewerStoreContext").then((mod) => ({
    default: mod.ViewerStoreProvider,
  })),
);
const ImagePreview = lazy(() =>
  import("~/components/.client/ImageViewer/components/Image/ImagePreview").then((mod) => ({
    default: mod.ImagePreview,
  })),
);

function useSignedFetch(connectionId: string) {
  const connection = useConnectionsStore(select.connection(connectionId));
  const connectionConfig = connection?.connectionConfig;
  const region = connection?.provider?.region;

  const signedFetch = useMemo(() => {
    if (!connectionConfig) return null;
    return createSignedFetch(liveCredentials(connectionId), region, connectionId);
  }, [connectionId, connectionConfig, region]);

  return { connectionConfig, signedFetch };
}

function ImagePreviewSlot({
  resourceId,
  signedFetch,
}: {
  resourceId: string;
  signedFetch: ReturnType<typeof createSignedFetch>;
}) {
  return (
    <ClientOnly>
      <Suspense fallback={<div className="animate-pulse w-full h-full bg-muted" />}>
        <ViewerStoreProvider resourceId={resourceId} signedFetch={signedFetch}>
          <ImagePreview />
        </ViewerStoreProvider>
      </Suspense>
    </ClientOnly>
  );
}

function BucketCardGridItem({ node, connectionId }: { node: TreeNode; connectionId: string }) {
  const { connectionConfig, signedFetch } = useSignedFetch(connectionId);
  const previewResourceId = usePreviewResourceId(node, connectionId);

  return (
    <GridItem
      node={node}
      preview={
        previewResourceId && signedFetch ? (
          <ImagePreviewSlot resourceId={previewResourceId} signedFetch={signedFetch} />
        ) : undefined
      }
    >
      {connectionConfig && <BucketPolicyStatusPill status={connectionConfig.bucketPolicyStatus} />}
    </GridItem>
  );
}

/**
 * Derives a prefix-relative preview resourceId from an S3 key.
 * `node.id` for directories points to the folder, not an image, so the viewer
 * would load the directory and render a black tile. When the tree builder
 * attached the first image as `node._Object`, derive the resourceId from its Key.
 */
function usePreviewResourceId(node: TreeNode, connectionId: string) {
  const { connectionConfig } = useSignedFetch(connectionId);
  return useMemo(() => {
    const explicitKey = node._Object?.Key ?? null;
    const isImage = explicitKey ? isImageFile(explicitKey) : isImageFile(node.name);
    if (!isImage) return null;
    if (!explicitKey) return node.id;
    if (!connectionConfig) return null;
    const prefix = connectionConfig.prefix?.replace(/^\/+|\/+$/g, "") ?? "";
    const pathName =
      prefix && explicitKey.startsWith(`${prefix}/`)
        ? explicitKey.slice(prefix.length + 1)
        : explicitKey;
    return `${connectionId}/${pathName}`;
  }, [node, connectionId, connectionConfig]);
}

function FileCardGridItem({ node, connectionId }: { node: TreeNode; connectionId: string }) {
  const { signedFetch } = useSignedFetch(connectionId);
  const previewResourceId = usePreviewResourceId(node, connectionId);
  const resolvedHttpsUrl = useConnectionsStore(
    previewResourceId ? selectHttpsUrl(previewResourceId) : () => null,
  );

  const hasPreview = !!previewResourceId && !!signedFetch && !!resolvedHttpsUrl;

  const size = node.type === "file" && node._Object?.Size ? filesize(node._Object.Size) : undefined;

  return (
    <GridItem
      node={node}
      preview={
        hasPreview && signedFetch ? (
          <ImagePreviewSlot resourceId={previewResourceId} signedFetch={signedFetch} />
        ) : undefined
      }
    >
      {typeof size === "string" && <Badge color="slate">{size}</Badge>}
    </GridItem>
  );
}

/**
 * Fetches a preview image for each directory node (only in `"entries"` mode)
 * lazily when the grid is visible. Bucket-level previews come from the
 * connection health probe, so this only targets sub-directory cards.
 *
 * Returns a new nodes array with `_Object` merged in immutably so downstream
 * `useMemo` hooks (e.g. `usePreviewResourceId`) see fresh references.
 */
function useDirectoryPreviews(nodes: TreeNode[], kind: DirectoryKind): TreeNode[] {
  const [previews, setPreviews] = useState<Record<string, _Object>>({});

  const pendingDirs = useMemo(
    () => (kind === "entries" ? nodes.filter((n) => n.type === "directory" && !n._Object) : []),
    [nodes, kind],
  );
  const pendingKey = pendingDirs.map((n) => n.id).join(",");

  useEffect(() => {
    if (pendingDirs.length === 0) return;
    const connectionId = pendingDirs[0].connectionId;
    const conn = useConnectionsStore.getState().connections[connectionId];
    if (!conn?.credentials) return;

    const controller = new AbortController();
    let cancelled = false;

    enrichDirectoryPreviews(pendingDirs, {
      connectionConfig: conn.connectionConfig,
      credentials: conn.credentials,
      connectionId,
      provider: conn.provider,
      signal: controller.signal,
    }).then((map) => {
      if (!cancelled && Object.keys(map).length > 0) setPreviews((prev) => ({ ...prev, ...map }));
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // pendingKey captures the set of directories needing previews; pendingDirs
    // is derived from the same render and is safe to close over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey]);

  return useMemo(() => {
    if (Object.keys(previews).length === 0) return nodes;
    return nodes.map((n) => (previews[n.id] ? { ...n, _Object: previews[n.id] } : n));
  }, [nodes, previews]);
}

export function DirectoryViewGrid({ nodes, kind }: { nodes: TreeNode[]; kind: DirectoryKind }) {
  const enrichedNodes = useDirectoryPreviews(nodes, kind);

  if (enrichedNodes.length === 0) return <DirectoryViewEmptyState kind={kind} />;

  const cx = `
    grid gap-6
    grid-cols-1 @md:grid-cols-2 @lg:grid-cols-3 @4xl:grid-cols-4 
  `;

  return (
    // Container queries (not viewport): column count tracks the content area width
    // — which shrinks when a sidebar pushes it — instead of the window width.
    <div className="@container">
      <div className={cx}>
        {enrichedNodes.map((node) =>
          node.type === "bucket" ? (
            <BucketCardGridItem key={node.id} node={node} connectionId={node.connectionId} />
          ) : (
            <FileCardGridItem key={node.id} node={node} connectionId={node.connectionId} />
          ),
        )}
      </div>
    </div>
  );
}
