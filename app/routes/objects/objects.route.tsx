import { lazy, Suspense, useEffect, useState } from "react";
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
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { isSpatialDataStore } from "~/components/.client/SpatialDataViewer/detection/isSpatialDataStore";
import { ClientOnly } from "~/components/ClientOnly";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { ShowFiltersToggle } from "~/components/DirectoryView/ShowFiltersToggle";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { LoaderView } from "~/components/Loader/LoaderView";
import { toastBridge, toToastVariant } from "~/toast-bridge";
import { liveCredentials, resolveResourceId } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { getFileCategory, stripUrlSuffix } from "~/utils/fileType";
import { createSignedFetch } from "~/utils/signedFetch";

const ImageViewer = lazy(() =>
  import("~/components/.client/ImageViewer/components/ImageViewer").then((module) => ({
    default: module.ImageViewer,
  })),
);

const SpatialDataViewer = lazy(() =>
  import("~/components/.client/SpatialDataViewer/components/SpatialDataViewer").then((module) => ({
    default: module.SpatialDataViewer,
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

const SDATA_PATH_PATTERN = /\.(sdata|spatialdata)(?:\.zarr)?\/?$/i;
const ZARR_PATH_PATTERN = /\.zarr\/?$/i;

/** Picks the SpatialData viewer for `.sdata` and `.sdata.zarr` paths by name;
 *  plain `.zarr` stores are sniffed client-side from root metadata. */
function isSpatialDataPath(resourceId: string): boolean {
  return SDATA_PATH_PATTERN.test(stripUrlSuffix(resourceId));
}

function isPlainZarrPath(resourceId: string): boolean {
  const path = stripUrlSuffix(resourceId);
  return ZARR_PATH_PATTERN.test(path) && !SDATA_PATH_PATTERN.test(path);
}

/** Client-side sniff wrapper for plain `.zarr` stores — resolves which lazy
 *  viewer renders, never loads in the loader. */
function ZarrViewerRouter({
  resourceId,
  signedFetch,
  httpsUrl,
}: {
  resourceId: string;
  signedFetch: ReturnType<typeof createSignedFetch>;
  httpsUrl: string;
}) {
  const [isSpatialData, setIsSpatialData] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The sniff resolves false on fetch failure (never rejects), so the OME-Zarr
    // viewer's CORS error path takes over instead of a stuck loader.
    isSpatialDataStore(resourceId, httpsUrl, signedFetch).then((result) => {
      if (!cancelled) setIsSpatialData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [resourceId, httpsUrl, signedFetch]);

  if (isSpatialData === null) {
    return <LoaderView label="Inspecting store…" />;
  }
  if (isSpatialData) {
    return <SpatialDataViewer resourceId={resourceId} signedFetch={signedFetch} />;
  }
  return <ImageViewer resourceId={resourceId} signedFetch={signedFetch} />;
}

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
        <ShowFiltersToggle />
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

      if (isSpatialDataPath(resourceId)) {
        return (
          <ClientOnly>
            <Suspense fallback={<LoaderView label="Loading viewer…" />}>
              <SpatialDataViewer resourceId={resourceId} signedFetch={signedFetch} />
            </Suspense>
          </ClientOnly>
        );
      }

      if (isPlainZarrPath(resourceId)) {
        const httpsUrl = resolveResourceId(resourceId).httpsUrl;
        return (
          <ClientOnly>
            <Suspense fallback={<LoaderView label="Loading viewer…" />}>
              <ZarrViewerRouter
                resourceId={resourceId}
                signedFetch={signedFetch}
                httpsUrl={httpsUrl}
              />
            </Suspense>
          </ClientOnly>
        );
      }

      return (
        <ClientOnly>
          <Suspense fallback={<LoaderView label="Loading viewer…" />}>
            <ImageViewer resourceId={resourceId} signedFetch={signedFetch} />
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
