import { Button, EmptyState } from "@cytario/design";
import { lazy, Suspense, useEffect, useRef } from "react";
import {
  type MetaFunction,
  type ShouldRevalidateFunction,
  useFetcher,
  useLoaderData,
  useNavigate,
  useNavigation,
} from "react-router";

import { clientLoader } from "./objects.clientLoader";
import { type BucketRouteLoaderResponse, loader } from "./objects.loader";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { ClientOnly } from "~/components/ClientOnly";
import { DataGrid } from "~/components/DataGrid/DataGrid";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { ShowFiltersToggle } from "~/components/DirectoryView/ShowFiltersToggle";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { useModal } from "~/hooks/useModal";
import { toastBridge, toToastVariant } from "~/toast-bridge";
import { liveCredentials } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { getFileType, isImageFile } from "~/utils/fileType";
import { getName } from "~/utils/pathUtils";
import { createSignedFetch } from "~/utils/signedFetch";

const Viewer = lazy(() =>
  import("~/components/.client/ImageViewer/components/ImageViewer").then((module) => ({
    default: module.Viewer,
  })),
);

export { clientLoader, loader };
export type { BucketRouteLoaderResponse };

export const middleware = [requestDurationMiddleware];

export const headers = () => ({ "Cache-Control": "no-store, private" });

export const meta: MetaFunction<typeof clientLoader> = ({ loaderData }) => [
  { title: loaderData?.name ?? "Cytario" },
];

export function buildCurrentNode(
  connectionId: string,
  connectionName: string,
  urlPath: string,
  children: TreeNode[] = [],
): TreeNode {
  const displayName = urlPath ? getName(urlPath, connectionName) : connectionName;
  return {
    id: `${connectionId}/${urlPath}`,
    connectionId,
    connectionName,
    pathName: urlPath,
    name: displayName,
    type: urlPath ? "directory" : "bucket",
    children,
  };
}

export const handle = {
  node: (match: {
    params: Record<string, string | undefined>;
    data?: BucketRouteLoaderResponse;
  }): TreeNode => {
    const { params, data } = match;
    const connectionId = data?.connectionId ?? params.id ?? "";
    const connectionName = data?.connectionName ?? params.id ?? "";
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

  const navigate = useNavigate();
  const { openModal } = useModal();
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

  const recentFetcher = useFetcher();
  const navigation = useNavigation();
  const lastRecentSubmit = useRef<string | null>(null);
  useEffect(() => {
    if (!urlPath) return;
    if (navigation.state !== "idle") return;
    if (lastRecentSubmit.current === resourceId) return;
    lastRecentSubmit.current = resourceId;
    recentFetcher.submit(
      {
        connectionId,
        pathName: urlPath,
        name,
        type: isSingleFile ? "file" : "directory",
      },
      { method: "post", action: "/recent" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, navigation.state]);

  if (connectionError) {
    return (
      <EmptyState
        icon="AlertTriangle"
        title="Connection unavailable"
        description={connectionError}
        action={
          <Button
            onPress={() => openModal("edit-connection", { connectionId })}
            variant="secondary"
          >
            Edit connection
          </Button>
        }
      />
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
    const isCsv = fileType === "CSV";
    const isTabularFile = ["CSV", "Parquet", "JSON"].includes(fileType);

    if (isTabularFile) {
      return (
        <div className="flex flex-col h-full">
          {isCsv && (
            <header className="flex items-center justify-between p-4 bg-amber-100 border-b border-amber-300 text-amber-900">
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  CSV files are slow to query. Convert to Parquet for better performance.
                </span>
              </div>
              <Button onPress={() => openModal("convert-overlay")}>Convert to Parquet</Button>
            </header>
          )}
          <DataGrid resourceId={resourceId} />
        </div>
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
          <Suspense fallback={<div>Loading viewer...</div>}>
            <Viewer resourceId={resourceId} signedFetch={signedFetch} />
          </Suspense>
        </ClientOnly>
      );
    }

    return (
      <EmptyState
        title="Unsupported file format."
        description="The selected file format is not supported for viewing."
        icon="Ban"
        action={
          <Button
            onPress={() => {
              navigate(-1);
            }}
          >
            Go Back
          </Button>
        }
      />
    );
  }

  if (pendingClientLoad) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex h-full items-center justify-center p-8 text-muted-foreground"
      >
        Loading…
      </div>
    );
  }

  return (
    <EmptyState
      title="No objects found in this bucket."
      description="Try uploading some files or check your permissions."
      icon="Ban"
      action={
        <Button
          onPress={() => {
            navigate(-1);
          }}
        >
          Go Back
        </Button>
      }
    />
  );
}
