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
import { constructS3Url } from "~/utils/resourceId";
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
  s3Url,
  signedFetch,
}: {
  s3Url: string;
  signedFetch: ReturnType<typeof createSignedFetch>;
}) {
  return (
    <ClientOnly>
      <Suspense fallback={<div className="animate-pulse w-full h-full bg-muted" />}>
        <ViewerStoreProvider url={s3Url} signedFetch={signedFetch}>
          <ImagePreview />
        </ViewerStoreProvider>
      </Suspense>
    </ClientOnly>
  );
}

function BucketCardGridItem({ node, connectionName }: { node: TreeNode; connectionName: string }) {
  const { connectionConfig, signedFetch } = useSignedFetch(connectionName);

  const previewKey = node._Object?.Key ?? null;
  const hasPreview = !!previewKey && isImageFile(previewKey) && !!signedFetch;
  const s3Url = hasPreview && connectionConfig ? constructS3Url(connectionConfig, previewKey) : "";

  return (
    <GridItem
      node={node}
      preview={
        hasPreview && signedFetch ? (
          <ImagePreviewSlot s3Url={s3Url} signedFetch={signedFetch} />
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
  const { connectionConfig: config, signedFetch } = useSignedFetch(connectionName);
  const explicitKey = node._Object?.Key ?? null;
  const resolvedHttpsUrl = useConnectionsStore(selectHttpsUrl(node.id));

  const s3Url =
    explicitKey && isImageFile(explicitKey) && config
      ? constructS3Url(config, explicitKey)
      : isImageFile(node.name)
        ? (resolvedHttpsUrl ?? "")
        : "";
  const hasPreview = !!s3Url && !!signedFetch;

  const size = node.type === "file" && node._Object?.Size ? filesize(node._Object.Size) : undefined;

  return (
    <GridItem
      node={node}
      preview={
        hasPreview && signedFetch ? (
          <ImagePreviewSlot s3Url={s3Url} signedFetch={signedFetch} />
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
