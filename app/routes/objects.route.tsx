import { _Object } from "@aws-sdk/client-s3";
import { Credentials } from "@aws-sdk/client-sts";
import { Button, ButtonLink, EmptyState } from "@cytario/design";
import { Ban, Bookmark, BookmarkCheck, Download } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect } from "react";
import {
  ActionFunctionArgs,
  MetaFunction,
  useFetcher,
  useLoaderData,
  useNavigate,
} from "react-router";

import { ConnectionConfig } from "~/.generated/client";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getPresignedUrl } from "~/.server/auth/getPresignedUrl";
import { getS3Client } from "~/.server/auth/getS3Client";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { CrumbsOptions, getCrumbs } from "~/components/Breadcrumbs/getCrumbs";
import { ClientOnly } from "~/components/ClientOnly";
import { DataGrid } from "~/components/DataGrid/DataGrid";
import {
  buildDirectoryTree,
  computeDirectoryLastModified,
  computeDirectorySize,
  TreeNode,
} from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { IndexStatus } from "~/components/DirectoryView/IndexStatus";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { type NotificationInput } from "~/components/Notification/Notification.store";
import { toastBridge, toToastVariant } from "~/toast-bridge";
import { getConnectionByAlias } from "~/utils/connectionConfig";
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
    const alias = data?.alias ?? params.alias ?? "";
    const bucketName = data?.bucketName ?? "";
    const pathName = params["*"] ?? "";
    const prefix = data?.connectionConfig?.prefix ?? "";

    // Calculate the relative path (path after the storage connection prefix)
    const normalizedPrefix = prefix.endsWith("/")
      ? prefix
      : prefix
        ? `${prefix}/`
        : "";
    const relativePath =
      normalizedPrefix && pathName.startsWith(normalizedPrefix)
        ? pathName.slice(normalizedPrefix.length)
        : normalizedPrefix && pathName === prefix.replace(/\/$/, "")
          ? ""
          : prefix
            ? pathName.slice(prefix.length).replace(/^\//, "")
            : pathName;

    const relativeSegments = relativePath ? relativePath.split("/") : [];

    // Build the storage connection path using alias
    const dataConnectionPath = prefix
      ? `/connections/${alias}/${prefix.replace(/\/$/, "")}`
      : `/connections/${alias}`;

    // Display name: show bucket name, or bucket/lastPrefixSegment if prefix exists
    const prefixLastSegment = prefix.replace(/\/$/, "").split("/").pop();
    const dataConnectionName = prefix
      ? `${bucketName}/${prefixLastSegment}`
      : bucketName;

    const options: CrumbsOptions = {
      dataConnectionName,
      dataConnectionPath,
    };

    return getCrumbs(`/connections/${alias}`, relativeSegments, options);
  },
};

export interface BucketRouteLoaderResponse {
  alias: string;
  nodes: TreeNode[];
  bucketName: string;
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
}: ActionFunctionArgs): Promise<BucketRouteLoaderResponse> => {
  const { user, credentials: bucketsCredentials } = context.get(authContext);
  const { alias } = params;

  if (!alias) throw new Error("Connection alias is required");

  const connectionConfig = await getConnectionByAlias(user, alias);
  if (!connectionConfig) {
    throw new Error("Connection configuration not found");
  }

  const { provider, name: bucketName } = connectionConfig;

  const credentials = bucketsCredentials[bucketName];
  if (!credentials) throw new Error(`No credentials for bucket: ${bucketName}`);

  const pathName = params["*"] as string;
  const prefix = getPrefix(pathName);
  const name = getName(pathName, bucketName);

  const isPinned = await checkIsPinnedPath(
    user.sub,
    provider,
    bucketName,
    pathName,
  );

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
          presignedUrl: await getPresignedUrl(connectionConfig, s3Client, obj.Key!),
        })),
      );

      const nodes = buildDirectoryTree(
        bucketName,
        objectsWithUrls,
        connectionConfig.provider,
        alias,
        prefix,
      );

      return {
        alias,
        credentials,
        connectionConfig,
        name,
        nodes,
        bucketName,
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
      alias,
      credentials,
      connectionConfig,
      name,
      nodes: [],
      bucketName,
      pathName,
      url,
      offsetsUrl,
      isPinned,
    };
  } catch (error) {
    console.error("Error in objects loader:", error);
    return {
      alias,
      credentials,
      connectionConfig,
      name,
      nodes: [],
      bucketName,
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
    alias,
    name,
    url,
    offsetsUrl,
    nodes,
    pathName,
    bucketName,
    credentials,
    connectionConfig,
    isPinned: loaderIsPinned,
    notification,
  } = useLoaderData<BucketRouteLoaderResponse>();

  const viewMode = useLayoutStore((state) => state.viewMode);
  const navigate = useNavigate();
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

  const { provider } = connectionConfig;

  const resourceId = createResourceId(
    connectionConfig.provider,
    connectionConfig.name,
    pathName,
  );
  const fileType = getFileType(resourceId);

  // Store credentials and bucket config in Zustand store (keyed by alias)
  useEffect(() => {
    if (credentials && connectionConfig) {
      setConnection(alias, credentials, connectionConfig);
    }
  }, [alias, credentials, connectionConfig, setConnection]);

  // Track recently viewed files (DB-backed via server action)
  const recentFetcher = useFetcher();
  useEffect(() => {
    if (url) {
      recentFetcher.submit(
        {
          provider: connectionConfig.provider,
          bucketName: connectionConfig.name,
          pathName,
          name,
          type: "file",
        },
        { method: "post", action: "/api/recently-viewed" },
      );
    }
  }, [resourceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pinning (DB-backed via server action)
  const pinFetcher = useFetcher();
  // Optimistic isPinned: flip while the pin request is in-flight
  let isPinned = loaderIsPinned;
  if (pinFetcher.state === "submitting") {
    isPinned = pinFetcher.formMethod?.toLowerCase() === "post";
  }

  const togglePin = useCallback(() => {
    if (!provider || !bucketName) return;
    if (isPinned) {
      pinFetcher.submit(
        { provider, bucketName, pathName: pathName ?? "" },
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
          provider,
          bucketName,
          pathName: pathName ?? "",
          displayName: pathName ? getName(pathName, bucketName) : bucketName,
          totalSize: String(totalSize),
          lastModified: lastModified ? String(lastModified) : "",
        },
        { method: "post", action: "/api/pinned" },
      );
    }
  }, [provider, bucketName, pathName, isPinned, nodes, pinFetcher]);

  // Show directory view when there are multiple objects
  if (nodes.length > 0) {
    return (
      <DirectoryView
        viewMode={viewMode}
        name={name}
        showFilters
        nodes={nodes}
        provider={connectionConfig.provider}
        bucketName={bucketName}
        pathName={pathName}
      >
        <Button
          onPress={togglePin}
          variant="secondary"
          aria-label={isPinned ? "Unpin directory" : "Pin directory"}
        >
          {isPinned ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          {isPinned ? "Pinned" : "Pin"}
        </Button>
        <ButtonLink href="?action=cyberduck" variant="secondary">
          <Download size={16} />
          Access with Cyberduck
        </ButtonLink>
        <IndexStatus alias={alias} />
        <ViewModeToggle />
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
              <Button onPress={() => navigate(`?action=convert-overlay`)}>
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
