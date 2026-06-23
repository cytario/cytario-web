import { Pill } from "@cytario/design";
import { filesize } from "filesize";
import { lazy, Suspense, useMemo } from "react";

import { type TreeNode } from "./buildDirectoryTree";
import { type DirectoryKind } from "./DirectoryView";
import { DirectoryViewEmptyState } from "./DirectoryViewEmptyState";
import { ClientOnly } from "~/components/ClientOnly";
import { GridItem } from "~/components/DirectoryView/GridItem";
import { ProviderPill } from "~/components/Pills/ProviderPill";
import { ScopePill } from "~/components/Pills/ScopePill";
import { liveCredentials, select, selectHttpsUrl } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
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

function useSignedFetch(connectionName: string) {
  const connectionConfig = useConnectionsStore(select.connectionConfig(connectionName));

  const signedFetch = useMemo(() => {
    if (!connectionConfig) return null;
    return createSignedFetch(liveCredentials(connectionName), connectionConfig, connectionName);
  }, [connectionName, connectionConfig]);

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

function BucketCardGridItem({ node, connectionName }: { node: TreeNode; connectionName: string }) {
  const { connectionConfig, signedFetch } = useSignedFetch(connectionName);

  // The connection probe attaches the first image in the bucket as `_Object`.
  // Its Key is the full S3 key; the preview resourceId is prefix-relative
  // (resolveResourceId re-adds connectionConfig.prefix), so strip the prefix —
  // `node.id` is the bucket root, which has no image to render.
  const previewKey = node._Object?.Key ?? null;
  const previewResourceId = useMemo(() => {
    if (!previewKey || !connectionConfig || !isImageFile(previewKey)) return null;
    const prefix = connectionConfig.prefix?.replace(/^\/+|\/+$/g, "") ?? "";
    const pathName =
      prefix && previewKey.startsWith(`${prefix}/`)
        ? previewKey.slice(prefix.length + 1)
        : previewKey;
    return `${connectionName}/${pathName}`;
  }, [previewKey, connectionConfig, connectionName]);

  return (
    <GridItem
      node={node}
      preview={
        previewResourceId && signedFetch ? (
          <ImagePreviewSlot resourceId={previewResourceId} signedFetch={signedFetch} />
        ) : undefined
      }
    >
      {connectionConfig && (
        <>
          <ScopePill scope={connectionConfig.ownerScope} />
          <ProviderPill provider={connectionConfig.provider} />
        </>
      )}
    </GridItem>
  );
}

function FileCardGridItem({ node, connectionName }: { node: TreeNode; connectionName: string }) {
  const { signedFetch } = useSignedFetch(connectionName);
  const explicitKey = node._Object?.Key ?? null;
  const resolvedHttpsUrl = useConnectionsStore(selectHttpsUrl(node.id));

  const isImage = (explicitKey ? isImageFile(explicitKey) : false) || isImageFile(node.name);
  const hasPreview = isImage && !!signedFetch && !!resolvedHttpsUrl;

  const size = node.type === "file" && node._Object?.Size ? filesize(node._Object.Size) : undefined;

  return (
    <GridItem
      node={node}
      preview={
        hasPreview && signedFetch ? (
          <ImagePreviewSlot resourceId={node.id} signedFetch={signedFetch} />
        ) : undefined
      }
    >
      {typeof size === "string" && <Pill color="slate">{size}</Pill>}
    </GridItem>
  );
}

export function DirectoryViewGrid({ nodes, kind }: { nodes: TreeNode[]; kind: DirectoryKind }) {
  if (nodes.length === 0) return <DirectoryViewEmptyState kind={kind} />;

  const cx = `
    grid gap-6
    grid-cols-1 @md:grid-cols-2 @lg:grid-cols-3 @4xl:grid-cols-4 
  `;

  return (
    // Container queries (not viewport): column count tracks the content area width
    // — which shrinks when a sidebar pushes it — instead of the window width.
    <div className="@container">
      <div className={cx}>
        {nodes.map((node) =>
          node.type === "bucket" ? (
            <BucketCardGridItem key={node.id} node={node} connectionName={node.connectionName} />
          ) : (
            <FileCardGridItem key={node.id} node={node} connectionName={node.connectionName} />
          ),
        )}
      </div>
    </div>
  );
}
