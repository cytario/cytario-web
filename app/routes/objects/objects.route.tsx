import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { type MetaFunction, type ShouldRevalidateFunction, useLoaderData } from "react-router";

import { clientLoader } from "./objects.clientLoader";
import {
  EmptyStateConnectionError,
  EmptyStateUnsupportedFile,
  EmptyStateNoObjects,
} from "./objects.emptyStates";
import { type BucketRouteLoaderResponse, loader } from "./objects.loader";
import { buildCurrentNode } from "./objects.node";
import { useRecordRecentView } from "../recent/useRecordRecentView";
import type { SignedFetch, ViewerContribution, ViewerProps } from "@cytario/plugin-api";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { ClientOnly } from "~/components/ClientOnly";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { LoaderView } from "~/components/Loader/LoaderView";
import { viewerRegistry } from "~/components/viewerRegistry";
import { toastBridge, toToastVariant } from "~/toast-bridge";
import { liveCredentials, resolveResourceId } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { getFileCategory } from "~/utils/fileType";
import { createSignedFetch } from "~/utils/signedFetch";

const ImageViewer = lazy(() =>
  import("~/components/.client/ImageViewer/components/ImageViewer").then((module) => ({
    default: module.ImageViewer,
  })),
);

const TextEditor = lazy(() =>
  import("~/components/TextEditor/TextEditor").then((module) => ({
    default: module.TextEditor,
  })),
);

const DataGrid = lazy(() =>
  import("~/components/DataGrid/DataGrid").then((module) => ({
    default: module.DataGrid,
  })),
);

const PdfViewer = lazy(() =>
  import("~/components/PdfViewer/PdfViewer").then((module) => ({
    default: module.PdfViewer,
  })),
);

interface PluginViewerRouterProps {
  resourceId: string;
  signedFetch: SignedFetch;
}

function PluginViewer({ resourceId, signedFetch }: PluginViewerRouterProps) {
  // Deep-link edge: the connections store may lag the route render. The
  // connection-presence selector re-runs resolution when the store populates.
  const connectionId = resourceId.slice(0, resourceId.indexOf("/"));
  const connectionPresent = useConnectionsStore(
    (state) => state.connections[connectionId] !== undefined,
  );

  // The host resolves the HTTPS URL client-side — plugins never read the
  // connection store. Retries while the store lags; once the connection is
  // present but still unresolvable, falls back to the built-in viewer (its
  // own error surface) rather than a dead loader.
  const [resolution, setResolution] = useState<{ url: string | null; failed: boolean }>(() => {
    try {
      return { url: resolveResourceId(resourceId).httpsUrl, failed: false };
    } catch {
      return { url: null, failed: false };
    }
  });
  const [resolved, setResolved] = useState<ViewerContribution | null>(null);
  const [sniffed, setSniffed] = useState(false);

  useEffect(() => {
    if (resolution.url !== null || resolution.failed) return;
    let cancelled = false;
    // Deferred out of the effect body so a failed attempt cannot cascade
    // synchronously.
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const url = resolveResourceId(resourceId).httpsUrl;
        if (!cancelled) setResolution({ url, failed: false });
      } catch {
        if (!cancelled && connectionPresent) setResolution({ url: null, failed: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [resolution, resourceId, connectionPresent]);

  const httpsUrl = resolution.url;

  // The sync match is only meaningful once the URL is resolved — the render
  // contract hands the plugin a resolved httpsUrl.
  const syncMatch = httpsUrl === null ? null : viewerRegistry.resolve(resourceId);

  // No sync match claimed the resource: sniff the content when a canHandle is
  // on offer. Rejected canHandle counts as false inside resolveAsync, so this
  // settles exactly once on the winner or null (fall through to the built-in
  // viewer).
  const sniff = httpsUrl !== null && syncMatch === null && viewerRegistry.hasAsync();

  useEffect(() => {
    if (!sniff || httpsUrl === null) return;
    let cancelled = false;
    viewerRegistry.resolveAsync(resourceId, httpsUrl, signedFetch).then((found) => {
      if (cancelled) return;
      setResolved(found);
      setSniffed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [sniff, httpsUrl, resourceId, signedFetch]);

  if ((httpsUrl === null && !resolution.failed) || (sniff && !sniffed)) {
    return <LoaderView label="Opening…" />;
  }

  const match = resolved ?? syncMatch;
  if (match && httpsUrl !== null) {
    const PluginViewerComponent = match.component as ComponentType<ViewerProps>;
    return (
      <PluginViewerComponent
        resourceId={resourceId}
        httpsUrl={httpsUrl}
        signedFetch={signedFetch}
      />
    );
  }

  return <ImageViewer resourceId={resourceId} signedFetch={signedFetch} />;
}

function PluginViewerRouter(props: PluginViewerRouterProps) {
  // Zero overhead when no plugin contributes a viewer: skip straight to the
  // built-in image viewer. Plugin components arrive as static imports (the
  // plugin package is in the bundle), so they render directly — no lazy().
  if (viewerRegistry.isEmpty()) {
    return <ImageViewer resourceId={props.resourceId} signedFetch={props.signedFetch} />;
  }
  return <PluginViewer {...props} />;
}

export { clientLoader, loader };
export type { BucketRouteLoaderResponse };

export const middleware = [requestDurationMiddleware];

export const headers = () => ({ "Cache-Control": "no-store, private" });

export const meta: MetaFunction<typeof clientLoader> = ({ loaderData }) => [
  { title: loaderData?.name ?? "Cytario" },
];

export const handle = {
  node: (match: {
    params: Record<string, string | undefined>;
    loaderData?: BucketRouteLoaderResponse;
  }): TreeNode => {
    const { params, loaderData } = match;
    const connectionId = loaderData?.connectionId ?? params.id ?? "";
    const connectionName = loaderData?.connectionName ?? params.id ?? "";
    const urlPath = params["*"] ?? "";
    return buildCurrentNode(connectionId, connectionName, urlPath);
  },
};

export const shouldRevalidate: ShouldRevalidateFunction = ({ currentUrl, nextUrl }) => {
  if (currentUrl.pathname !== nextUrl.pathname) return true;
  if (currentUrl.search !== nextUrl.search) return true;
  return false;
};

export default function ObjectsRoute() {
  const {
    connectionId,
    connectionName,
    name,
    nodes,
    urlPath,
    isSingleFile,
    notification,
    pendingClientLoad,
    connectionError,
  } = useLoaderData<typeof clientLoader>();

  const signingRegion = useConnectionsStore(
    (state) => state.connections[connectionId]?.provider?.region,
  );

  useEffect(() => {
    if (notification) {
      toastBridge.emit({
        variant: toToastVariant(notification.status ?? "info"),
        message: notification.message,
      });
    }
  }, [notification]);

  const resourceId = `${connectionId}/${urlPath}`;

  useRecordRecentView(resourceId, { connectionId, pathName: urlPath, name, isSingleFile });

  if (connectionError) {
    return (
      <EmptyStateConnectionError connectionError={connectionError} connectionId={connectionId} />
    );
  }

  if (nodes.length > 0) {
    const currentNode = buildCurrentNode(connectionId, connectionName, urlPath, nodes);

    return (
      <DirectoryView kind="entries" node={currentNode}>
        <ViewModeToggle />
      </DirectoryView>
    );
  }

  if (isSingleFile) {
    const category = getFileCategory(resourceId);

    if (category === "text") {
      const signedFetch = createSignedFetch(
        liveCredentials(connectionId),
        signingRegion,
        connectionId,
      );
      return (
        <ClientOnly>
          <Suspense fallback={<LoaderView label="Loading editor…" />}>
            <TextEditor key={resourceId} resourceId={resourceId} signedFetch={signedFetch} />
          </Suspense>
        </ClientOnly>
      );
    }

    if (category === "tabular") {
      return (
        <ClientOnly fallback={<LoaderView label="Loading data…" />}>
          <Suspense fallback={<LoaderView label="Loading data…" />}>
            <DataGrid resourceId={resourceId} />
          </Suspense>
        </ClientOnly>
      );
    }

    if (category === "document") {
      const signedFetch = createSignedFetch(
        liveCredentials(connectionId),
        signingRegion,
        connectionId,
      );

      return (
        <ClientOnly>
          <Suspense fallback={<LoaderView label="Loading viewer…" />}>
            <PdfViewer key={resourceId} resourceId={resourceId} signedFetch={signedFetch} />
          </Suspense>
        </ClientOnly>
      );
    }

    if (category === "image") {
      const signedFetch = createSignedFetch(
        liveCredentials(connectionId),
        signingRegion,
        connectionId,
      );

      return (
        <ClientOnly>
          <Suspense fallback={<LoaderView label="Loading viewer…" />}>
            <PluginViewerRouter
              key={resourceId}
              resourceId={resourceId}
              signedFetch={signedFetch}
            />
          </Suspense>
        </ClientOnly>
      );
    }

    return <EmptyStateUnsupportedFile />;
  }

  if (pendingClientLoad) {
    return <LoaderView label="Loading files…" />;
  }

  return <EmptyStateNoObjects />;
}
