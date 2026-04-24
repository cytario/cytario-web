import { Button, EmptyState } from "@cytario/design";
import { Ban, Bookmark, BookmarkCheck, Download } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo } from "react";
import {
  type MetaFunction,
  type ShouldRevalidateFunction,
  useFetcher,
  useLoaderData,
  useNavigate,
  useParams,
} from "react-router";

import { type BucketRouteLoaderResponse, loader } from "./objects.loader";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { getCrumbs } from "~/components/Breadcrumbs/getCrumbs";
import { ClientOnly } from "~/components/ClientOnly";
import { DataGrid } from "~/components/DataGrid/DataGrid";
import {
  computeDirectoryLastModified,
  computeDirectorySize,
} from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { ShowFiltersToggle } from "~/components/DirectoryView/ShowFiltersToggle";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { LavaLoader } from "~/components/LavaLoader";
import { useModal } from "~/hooks/useModal";
import { useDirectoryListing } from "~/routes/connectionIndex/useDirectoryListing";
import { useDriftCheck } from "~/routes/connectionIndex/useDriftCheck";
import { toastBridge, toToastVariant } from "~/toast-bridge";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { getFileType } from "~/utils/fileType";
import { getName, getPrefix } from "~/utils/pathUtils";
import { constructS3Url } from "~/utils/resourceId";
import { createSignedFetch } from "~/utils/signedFetch";

// Lazy load Viewer to prevent SSR issues with client-only code
const Viewer = lazy(() =>
  import("~/components/.client/ImageViewer/components/ImageViewer").then(
    (module) => ({ default: module.Viewer }),
  ),
);

export { loader };
export type { BucketRouteLoaderResponse };

export const middleware = [requestDurationMiddleware];

export const meta: MetaFunction<typeof loader> = ({ params, loaderData }) => {
  const urlPath = params["*"] ?? "";
  const tail = urlPath ? urlPath.split("/").filter(Boolean).pop() : undefined;
  return [{ title: tail ?? loaderData?.bucketName ?? "Cytario" }];
};

export const handle = {
  breadcrumb: (match: {
    params: Record<string, string | undefined>;
    data?: BucketRouteLoaderResponse;
  }) => {
    const { params, data } = match;
    const connectionName = data?.connectionName ?? params.name ?? "";
    const pathName = params["*"] ?? "";

    const segments = pathName ? pathName.split("/") : [];
    const basePath = `/connections/${connectionName}`;

    return getCrumbs(basePath, segments, {
      dataConnectionName: connectionName,
      dataConnectionPath: basePath,
    });
  },
};

/**
 * The loader is connection-stable — it ensures the parquet index exists and
 * returns credentials/config. Path-level state (urlPath, isPinned, etc.) is
 * derived client-side from useParams/fetchers, so only a connection change
 * should re-run the loader. Splat navigation, auxiliary fetcher submissions
 * (POST /api/pinned, /api/recently-viewed), and in-place refreshes all skip.
 */
export const shouldRevalidate: ShouldRevalidateFunction = ({
  currentParams,
  nextParams,
}) => currentParams.name !== nextParams.name;

export default function ObjectsRoute() {
  const {
    connectionName,
    bucketName,
    credentials,
    connectionConfig,
    notification,
  } = useLoaderData<typeof loader>();

  const params = useParams();
  const urlPath = params["*"] ?? "";

  // S3 key path (connection prefix + urlPath). Needed for the listing hook
  // and the image viewer. API calls take urlPath directly — it is
  // prefix-relative.
  const connPrefix = connectionConfig.prefix?.replace(/\/$/, "") ?? "";
  const absolutePath = [connPrefix, urlPath].filter(Boolean).join("/");

  const connection = useMemo(
    () => ({ connectionConfig, credentials }),
    [connectionConfig, credentials],
  );

  const viewMode = useLayoutStore((state) => state.viewMode);
  const navigate = useNavigate();
  const { openModal } = useModal();

  const resourceId = `${connectionName}/${urlPath}`;
  const fileType = getFileType(resourceId);
  // Treat anything with a recognised viewable extension as a single file. The
  // remaining cases (no extension, unknown extension, empty path) flow through
  // the directory listing path.
  const isViewableFile =
    fileType !== "Unknown" && fileType !== "Directory" && urlPath !== "";

  // Handle notifications from loader
  useEffect(() => {
    if (notification) {
      toastBridge.emit({
        variant: toToastVariant(notification.status ?? "info"),
        message: notification.message,
      });
    }
  }, [notification]);

  const {
    nodes,
    rows: indexRows,
    isLoading: isListingLoading,
  } = useDirectoryListing({
    connection,
    prefix: getPrefix(absolutePath) ?? "",
    urlPath,
    enabled: !isViewableFile,
  });

  // Drift heal: compare the live S3 slice against what the index gave us.
  // On mismatch, fire-and-forget a partial reindex. The rendered tree stays
  // off `indexRows` — the patched index is picked up on next visit.
  useDriftCheck({
    connectionName,
    urlPath,
    indexRows,
    enabled: !isViewableFile && !isListingLoading,
  });

  // Track recently viewed files and directories (DB-backed via server action).
  // Only track when urlPath is non-empty — the connection root itself isn't a viewable item.
  const recentFetcher = useFetcher();
  useEffect(() => {
    if (!urlPath) return;
    recentFetcher.submit(
      {
        connectionName,
        pathName: urlPath,
        name: getName(urlPath, bucketName),
        type: isViewableFile ? "file" : "directory",
      },
      { method: "post", action: "/api/recently-viewed" },
    );
    // Intentionally depends only on resourceId — it is derived from connectionName + urlPath,
    // so a resourceId change guarantees the captured values are fresh. Other deps (recentFetcher,
    // connectionName, urlPath, bucketName, isViewableFile) are stable within the same resourceId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

  // Pinning (DB-backed via server action).
  //
  // The loader is connection-stable, so isPinned for the current path is
  // fetched client-side via GET /api/pinned whenever the path changes.
  const pinStatusFetcher = useFetcher<{ isPinned: boolean }>();
  useEffect(() => {
    pinStatusFetcher.load(
      `/api/pinned?connectionName=${encodeURIComponent(connectionName)}&pathName=${encodeURIComponent(urlPath)}`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is stable, re-fire only on path change
  }, [connectionName, urlPath]);

  const pinFetcher = useFetcher();
  // Optimistic isPinned: flip while a pin mutation is in-flight, otherwise
  // reflect the latest GET result (defaulting to false before it lands).
  let isPinned = pinStatusFetcher.data?.isPinned ?? false;
  if (pinFetcher.state !== "idle") {
    isPinned = pinFetcher.formMethod?.toLowerCase() === "post";
  }

  const togglePin = useCallback(() => {
    if (isPinned) {
      pinFetcher.submit(
        { connectionName, pathName: urlPath },
        { method: "delete", action: "/api/pinned" },
      );
    } else {
      const totalSize = nodes.reduce(
        (sum, node) => sum + computeDirectorySize(node),
        0,
      );
      const lastModified = nodes.reduce(
        (max, node) => Math.max(max, computeDirectoryLastModified(node)),
        0,
      );
      pinFetcher.submit(
        {
          connectionName,
          pathName: urlPath,
          displayName: urlPath
            ? getName(urlPath, connectionName)
            : connectionName,
          totalSize: String(totalSize),
          lastModified: lastModified ? String(lastModified) : "",
        },
        { method: "post", action: "/api/pinned" },
      );
    }
  }, [connectionName, urlPath, isPinned, nodes, pinFetcher]);

  // Single-file viewer dispatch (extension-based; happens before the listing
  // hook fires so we don't pay a DuckDB round-trip for files we can render
  // directly).
  if (isViewableFile) {
    const isCsv = fileType === "CSV";
    const isTabularFile = ["CSV", "Parquet", "JSON"].includes(fileType);

    if (isTabularFile) {
      return (
        <div className="flex flex-col h-full">
          {isCsv && (
            <header className="flex items-center justify-between p-4 bg-amber-100 border-b border-amber-300 text-amber-900">
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  CSV files are slow to query. Convert to Parquet for better
                  performance.
                </span>
              </div>
              <Button onPress={() => openModal("convert-overlay")}>
                Convert to Parquet
              </Button>
            </header>
          )}
          <DataGrid resourceId={resourceId} />
        </div>
      );
    }

    const isViewableImage =
      fileType === "TIFF" || fileType === "OME-TIFF" || fileType === "OME-Zarr";

    if (isViewableImage) {
      const s3Url = constructS3Url(connectionConfig, absolutePath);
      const signedFetch = createSignedFetch(
        () =>
          useConnectionsStore.getState().connections[connectionName]
            ?.credentials,
        connectionConfig,
      );
      return (
        <ClientOnly>
          <Suspense fallback={<div>Loading viewer...</div>}>
            <Viewer url={s3Url} signedFetch={signedFetch} />
          </Suspense>
        </ClientOnly>
      );
    }

    return (
      <EmptyState
        title="Unsupported file format."
        description="The selected file format is not supported for viewing."
        icon={Ban}
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

  // Directory view — index-backed via useDirectoryListing
  if (isListingLoading) {
    return (
      <div role="status" aria-label="Loading directory listing">
        <LavaLoader />
      </div>
    );
  }

  if (nodes.length > 0) {
    return (
      <DirectoryView
        kind="entries"
        viewMode={viewMode}
        name={connectionName}
        nodes={nodes}
        secondaryActions={
          <>
            <ShowFiltersToggle />
            <ViewModeToggle />
          </>
        }
      >
        <Button
          onPress={togglePin}
          variant="secondary"
          aria-label={isPinned ? "Unpin directory" : "Pin directory"}
        >
          {isPinned ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          {isPinned ? "Pinned" : "Pin"}
        </Button>
        <Button
          onPress={() => openModal("cyberduck", { connectionName })}
          variant="secondary"
        >
          <Download size={16} />
          Access with Cyberduck
        </Button>
      </DirectoryView>
    );
  }

  return (
    <EmptyState
      title="No objects found in this bucket."
      description="Try uploading some files or check your permissions."
      icon={Ban}
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
