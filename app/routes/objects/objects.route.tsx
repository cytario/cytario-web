import { lazy, Suspense, useEffect } from "react";
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
import { ClientOnly } from "~/components/ClientOnly";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { ShowFiltersToggle } from "~/components/DirectoryView/ShowFiltersToggle";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { LoaderView } from "~/components/Loader/LoaderView";
import { toastBridge, toToastVariant } from "~/toast-bridge";
import { liveCredentials } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { getFileType, isImageFile, isTextFile } from "~/utils/fileType";
import { createSignedFetch } from "~/utils/signedFetch";

const Viewer = lazy(() =>
  import("~/components/.client/ImageViewer/components/ImageViewer").then((module) => ({
    default: module.Viewer,
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
  const fileType = getFileType(resourceId);

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
    const isTabularFile = ["CSV", "Parquet"].includes(fileType);

    if (isTextFile(resourceId)) {
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

    if (isTabularFile) {
      return (
        <ClientOnly fallback={<LoaderView label="Loading data…" />}>
          <Suspense fallback={<LoaderView label="Loading data…" />}>
            <DataGrid resourceId={resourceId} />
          </Suspense>
        </ClientOnly>
      );
    }

    if (isImageFile(resourceId)) {
      const signedFetch = createSignedFetch(
        liveCredentials(connectionId),
        signingRegion,
        connectionId,
      );

      return (
        <ClientOnly>
          <Suspense fallback={<LoaderView label="Loading viewer…" />}>
            <Viewer resourceId={resourceId} signedFetch={signedFetch} />
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
