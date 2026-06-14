import { Button, EmptyState } from "@cytario/design";
import { AlertTriangle, Ban, Bookmark, BookmarkCheck, Download } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef } from "react";
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
import { useModal } from "~/hooks/useModal";
import { toastBridge, toToastVariant } from "~/toast-bridge";
import { liveCredentials } from "~/utils/connectionsStore/selectors";
import { getFileType, isImageFile } from "~/utils/fileType";
import { getName } from "~/utils/pathUtils";
import { constructS3Url } from "~/utils/resourceId";
import { createSignedFetch } from "~/utils/signedFetch";

const Viewer = lazy(() =>
  import("~/components/.client/ImageViewer/components/ImageViewer").then((module) => ({
    default: module.Viewer,
  })),
);

export { clientLoader, loader };
export type { BucketRouteLoaderResponse };

export const middleware = [requestDurationMiddleware];

// Response carries STS credentials — keep it out of every cache between origin
// and browser.
export const headers = () => ({ "Cache-Control": "no-store, private" });

export const meta: MetaFunction<typeof clientLoader> = ({ loaderData }) => [
  { title: loaderData?.name ?? "Cytario" },
];

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

// `formAction` fires for fetcher submissions too, so a blanket `if (formAction)`
// is unsafe here: the record-viewed fetcher posts to /recent on every nav and
// must NOT retrigger the S3 listing. But the favorite toggle must refresh
// `isFavorite` — once the fetcher idles the optimistic state evaporates and the
// button reverts to stale loader data. Favorite toggles are rare, so one extra
// listing per toggle is acceptable; everything else still revalidates only on
// URL change.
export const shouldRevalidate: ShouldRevalidateFunction = ({ currentUrl, nextUrl, formAction }) => {
  if (formAction === "/favorites") return true;
  if (currentUrl.pathname !== nextUrl.pathname) return true;
  if (currentUrl.search !== nextUrl.search) return true;
  return false;
};

export default function ObjectsRoute() {
  const {
    connectionName,
    name,
    nodes,
    urlPath,
    pathName,
    connectionConfig,
    isFavorite: loaderIsFavorite,
    isSingleFile,
    notification,
    pendingClientLoad,
    connectionError,
  } = useLoaderData<typeof clientLoader>();

  const viewMode = useLayoutStore((state) => state.viewMode);
  const navigate = useNavigate();
  const { openModal } = useModal();

  useEffect(() => {
    if (notification) {
      toastBridge.emit({
        variant: toToastVariant(notification.status ?? "info"),
        message: notification.message,
      });
    }
  }, [notification]);

  const resourceId = `${connectionName}/${urlPath}`;
  const fileType = getFileType(resourceId);

  // Defer the submit until navigation goes idle — submitting during hydration
  // races RR's bulk-fetch single-fetch and trips RR issue #13873.
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
        connectionName,
        pathName: urlPath,
        name,
        type: isSingleFile ? "file" : "directory",
      },
      { method: "post", action: "/recent" },
    );
    // Other deps are stable within the same resourceId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, navigation.state]);

  const favoriteFetcher = useFetcher();
  // Optimistic toggle while the request is in flight.
  let isFavorite = loaderIsFavorite;
  if (favoriteFetcher.state !== "idle") {
    isFavorite = favoriteFetcher.formMethod?.toLowerCase() === "put";
  }

  const toggleFavorite = useCallback(() => {
    if (isFavorite) {
      favoriteFetcher.submit(
        { connectionName, pathName: urlPath },
        { method: "delete", action: "/favorites" },
      );
    } else {
      const totalSize = nodes.reduce((sum, node) => sum + computeDirectorySize(node), 0);
      const lastModified = nodes.reduce(
        (max, node) => Math.max(max, computeDirectoryLastModified(node)),
        0,
      );
      favoriteFetcher.submit(
        {
          connectionName,
          pathName: urlPath,
          displayName: urlPath ? getName(urlPath, connectionName) : connectionName,
          totalSize: String(totalSize),
          lastModified: lastModified ? String(lastModified) : "",
        },
        { method: "put", action: "/favorites" },
      );
    }
  }, [connectionName, urlPath, isFavorite, nodes, favoriteFetcher]);

  if (connectionError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Connection unavailable"
        description={connectionError}
        action={
          <Button
            onPress={() => openModal("edit-connection", { nodeName: connectionName })}
            variant="secondary"
          >
            Edit connection
          </Button>
        }
      />
    );
  }

  if (nodes.length > 0) {
    return (
      <DirectoryView
        kind="entries"
        viewMode={viewMode}
        // Title is the current level: last path segment in a subdirectory,
        // the connection name at the root.
        name={urlPath ? getName(urlPath, connectionName) : connectionName}
        nodes={nodes}
        secondaryActions={
          <>
            <ShowFiltersToggle />
            <ViewModeToggle />
          </>
        }
      >
        <Button
          onPress={toggleFavorite}
          variant="secondary"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          {isFavorite ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          {isFavorite ? "Favorited" : "Favorite"}
        </Button>
        <Button onPress={() => openModal("cyberduck", { connectionName })} variant="secondary">
          <Download size={16} />
          Access with Cyberduck
        </Button>
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

    // Gate on `isImageFile` so plugin-contributed formats reach `<Viewer>`
    // without per-format branching here.
    if (isImageFile(resourceId)) {
      // `pathName` already includes the connection prefix.
      const s3Url = constructS3Url(connectionConfig, pathName);
      const signedFetch = createSignedFetch(
        liveCredentials(connectionName),
        connectionConfig,
        connectionName,
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

  // Distinguish "still loading" from "loaded but empty" to avoid flashing the
  // empty state during the SSR → hydration handoff.
  if (pendingClientLoad) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex h-full items-center justify-center p-8 text-slate-500"
      >
        Loading…
      </div>
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
