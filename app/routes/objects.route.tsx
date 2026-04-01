import { _Object } from "@aws-sdk/client-s3";
import { Credentials } from "@aws-sdk/client-sts";
import { Button, EmptyState } from "@cytario/design";
import { Ban, Bookmark, BookmarkCheck, Download } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect } from "react";
import {
  type LoaderFunctionArgs,
  type MetaFunction,
  useFetcher,
  useLoaderData,
  useNavigate,
} from "react-router";

import { ConnectionConfig } from "~/.generated/client";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getPresignedUrl } from "~/.server/auth/getPresignedUrl";
import { getS3Client } from "~/.server/auth/getS3Client";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { getCrumbs } from "~/components/Breadcrumbs/getCrumbs";
import { ClientOnly } from "~/components/ClientOnly";
import { DataGrid } from "~/components/DataGrid/DataGrid";
import {
  buildDirectoryTree,
  computeDirectoryLastModified,
  computeDirectorySize,
  TreeNode,
} from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { type NotificationInput } from "~/components/Notification/Notification.store";
import { useModal } from "~/hooks/useModal";
import { getConnection } from "~/routes/connections/connections.server";
import { toastBridge, toToastVariant } from "~/toast-bridge";
import { select, useConnectionsStore } from "~/utils/connectionsStore";
import { getFileType } from "~/utils/fileType";
import { getObjects } from "~/utils/getObjects";
import { getOffsetKeyForOmeTiff } from "~/utils/omeTiffOffsets";
import { getName, getPrefix } from "~/utils/pathUtils";
import { checkIsPinnedPath } from "~/utils/pinnedPaths.server";
import { createResourceId } from "~/utils/resourceId";

// Lazy load Viewer to prevent SSR issues with client-only code
const Viewer = lazy(() =>
  import("~/components/.client/ImageViewer/components/ImageViewer").then(
    (module) => ({ default: module.Viewer }),
  ),
);

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

export interface BucketRouteLoaderResponse {
  connectionName: string;
  nodes: TreeNode[];
  bucketName: string;
  /** URL path segment after /connections/:name/ (relative to connection root) */
  urlPath: string;
  /** Full S3 key (connection prefix + urlPath) */
  pathName: string;
  name: string;
  url?: string;
  offsetsUrl?: string;
  notification?: NotificationInput;
  credentials: Credentials;
  connectionConfig: ConnectionConfig;
  isPinned: boolean;
}

export type ObjectPresignedUrl = Readonly<_Object & { presignedUrl: string }>;

export const loader = async ({
  params,
  context,
}: LoaderFunctionArgs): Promise<BucketRouteLoaderResponse> => {
  const { user, credentials: bucketsCredentials } = context.get(authContext);
  const { name: connectionName } = params;

  if (!connectionName) throw new Error("Connection name is required");

  const connectionConfig = await getConnection(user, connectionName);
  if (!connectionConfig) {
    throw new Error("Connection configuration not found");
  }

  const { bucketName } = connectionConfig;

  const credentials = bucketsCredentials[bucketName];
  if (!credentials) throw new Error(`No credentials for bucket: ${bucketName}`);

  const urlPath = params["*"] ?? "";
  const connPrefix = connectionConfig.prefix?.replace(/\/$/, "") ?? "";
  const pathName = connPrefix
    ? urlPath
      ? `${connPrefix}/${urlPath}`
      : connPrefix
    : urlPath;
  const prefix = getPrefix(pathName);
  const name = getName(pathName, bucketName);

  const isPinned = await checkIsPinnedPath(user.sub, connectionName, urlPath);

  try {
    const s3Client = await getS3Client(connectionConfig, credentials, user.sub);

    const objects: Readonly<_Object>[] = await getObjects(
      connectionConfig,
      s3Client,
      undefined,
      prefix,
    );

    if (objects.length > 0) {
      const objectsWithUrls: ObjectPresignedUrl[] = await Promise.all(
        objects.map(async (obj) => ({
          ...obj,
          presignedUrl: await getPresignedUrl(
            connectionConfig,
            s3Client,
            obj.Key!,
          ),
        })),
      );

      const nodes = buildDirectoryTree(
        bucketName,
        objectsWithUrls,
        connectionConfig.provider,
        connectionName,
        prefix,
        urlPath,
      );

      return {
        connectionName,
        credentials,
        connectionConfig,
        name,
        nodes,
        bucketName,
        urlPath,
        pathName,
        isPinned,
      };
    }

    const offsetKey = getOffsetKeyForOmeTiff(pathName);

    const [url, offsetsUrl] = await Promise.all([
      getPresignedUrl(connectionConfig, s3Client, pathName),
      offsetKey
        ? getPresignedUrl(connectionConfig, s3Client, offsetKey)
        : undefined,
    ]);

    return {
      connectionName,
      credentials,
      connectionConfig,
      name,
      nodes: [],
      bucketName,
      urlPath,
      pathName,
      url,
      offsetsUrl,
      isPinned,
    };
  } catch (error) {
    console.error("Error in objects loader:", error);
    return {
      connectionName,
      credentials,
      connectionConfig,
      name,
      nodes: [],
      bucketName,
      urlPath,
      pathName,
      isPinned,
      notification: {
        message:
          "We couldn't load the objects for this bucket. Please check your connection or try again later.",
        status: "error",
      },
    };
  }
};

export default function ObjectsRoute() {
  const {
    connectionName,
    name,
    url,
    offsetsUrl,
    nodes,
    urlPath,
    pathName,
    credentials,
    connectionConfig,
    isPinned: loaderIsPinned,
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

  const resourceId = createResourceId(
    connectionConfig.provider,
    connectionConfig.bucketName,
    pathName,
  );
  const fileType = getFileType(resourceId);

  // Store credentials and connection config in Zustand store (keyed by connection name)
  useEffect(() => {
    if (credentials && connectionConfig) {
      setConnection(connectionName, credentials, connectionConfig);
    }
  }, [connectionName, credentials, connectionConfig, setConnection]);

  // Track recently viewed files (DB-backed via server action)
  const recentFetcher = useFetcher();
  useEffect(() => {
    if (url) {
      recentFetcher.submit(
        { connectionName, pathName: urlPath, name, type: "file" },
        { method: "post", action: "/api/recently-viewed" },
      );
    }
    // Intentionally depends only on resourceId — it is derived from connectionName + pathName + provider,
    // so a resourceId change guarantees the captured values are fresh. Other deps (recentFetcher,
    // connectionName, urlPath, name) are stable within the same resourceId.
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
        viewMode={viewMode}
        name={connectionName}
        showFilters
        nodes={nodes}
        urlPath={urlPath}
        secondaryActions={<ViewModeToggle />}
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
  if (url) {
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

    if (fileType === "TIFF" || fileType === "OME-TIFF") {
      return (
        <ClientOnly>
          <Suspense fallback={<div>Loading viewer...</div>}>
            <Viewer resourceId={resourceId} url={url} offsetsUrl={offsetsUrl} />
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
