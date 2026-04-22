import { Button, EmptyState } from "@cytario/design";
import { Ban, Bookmark, BookmarkCheck, Download } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect } from "react";
import {
  type MetaFunction,
  type ShouldRevalidateFunction,
  useFetcher,
  useLoaderData,
  useNavigate,
} from "react-router";

import {
  type BucketRouteLoaderResponse,
  loader,
} from "./objects.loader";
import { authMiddleware } from "~/.server/auth/authMiddleware";
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
import { select, useConnectionsStore } from "~/utils/connectionsStore";
import { getFileType } from "~/utils/fileType";
import { getName } from "~/utils/pathUtils";
import { buildHttpsUrl } from "~/utils/resourceId";
import { createSignedFetch } from "~/utils/signedFetch";

// Lazy load Viewer to prevent SSR issues with client-only code
const Viewer = lazy(() =>
  import("~/components/.client/ImageViewer/components/ImageViewer").then(
    (module) => ({ default: module.Viewer }),
  ),
);

export { loader };
export type { BucketRouteLoaderResponse };

export const middleware = [requestDurationMiddleware, authMiddleware];

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => [
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

/**
 * Revalidate only when the URL actually changes. React Router's default
 * is to revalidate every active loader after any action, which on this
 * route fires the loader 1.5-3x per client-side navigation (see
 * TSPEC-PERF-001 Table 10.2 in cytario-docs) — auxiliary fetchers
 * (POST /api/recently-viewed, POST /api/pinned) fire on every file view
 * and would each trigger a full S3 listing re-run.
 *
 * Keying on URL change only also avoids a subtle trap: `formAction` is
 * populated for fetcher submissions too, not just Form submissions on
 * this route, so the obvious `if (formAction) return defaultShouldRevalidate`
 * check would re-trigger revalidation for every aux-fetcher completion.
 * This route has no mutating forms of its own, so skipping the
 * `formAction` branch is safe.
 */
export const shouldRevalidate: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
}) => {
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
    credentials,
    connectionConfig,
    isPinned: loaderIsPinned,
    isSingleFile,
    notification,
  } = useLoaderData<typeof loader>();

  const viewMode = useLayoutStore((state) => state.viewMode);
  const navigate = useNavigate();
  const { openModal } = useModal();
  const setConnection = useConnectionsStore(select.setConnection);

  // Handle notifications from loader
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

  // Store credentials and connection config in Zustand store (keyed by connection name)
  useEffect(() => {
    if (credentials && connectionConfig) {
      setConnection(connectionName, credentials, connectionConfig);
    }
  }, [connectionName, credentials, connectionConfig, setConnection]);

  // Track recently viewed files and directories (DB-backed via server action).
  // Only track when urlPath is non-empty — the connection root itself isn't a viewable item.
  // Server-side loader split for read path is covered by C-81.
  const recentFetcher = useFetcher();
  useEffect(() => {
    if (!urlPath) return;
    recentFetcher.submit(
      {
        connectionName,
        pathName: urlPath,
        name,
        type: isSingleFile ? "file" : "directory",
      },
      { method: "post", action: "/api/recently-viewed" },
    );
    // Intentionally depends only on resourceId — it is derived from connectionName + pathName,
    // so a resourceId change guarantees the captured values are fresh. Other deps (recentFetcher,
    // connectionName, urlPath, name, isSingleFile) are stable within the same resourceId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

  // Pinning (DB-backed via server action)
  const pinFetcher = useFetcher();
  // Optimistic isPinned: flip while the pin request is in-flight
  let isPinned = loaderIsPinned;
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

  // Show directory view when there are multiple objects
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

  // Open file viewer when a single file is selected
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
      const s3Url = buildHttpsUrl(connectionConfig, pathName);
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

  // Render placeholder when no objects found
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
