import { _Object, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Credentials } from "@aws-sdk/client-sts";
import { lazy, Suspense, useCallback, useEffect } from "react";
import {
  ActionFunctionArgs,
  MetaFunction,
  useLoaderData,
  useNavigate,
} from "react-router";

import { BucketConfig } from "~/.generated/client";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getPresignedUrl } from "~/.server/auth/getPresignedUrl";
import { getS3Client } from "~/.server/auth/getS3Client";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { CrumbsOptions, getCrumbs } from "~/components/Breadcrumbs/getCrumbs";
import { ClientOnly } from "~/components/ClientOnly";
import { Button, ButtonLink, Icon } from "~/components/Controls";
import { DataGrid } from "~/components/DataGrid/DataGrid";
import {
  buildDirectoryTree,
  TreeNode,
} from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { NotificationInput } from "~/components/Notification/Notification";
import { useBackendNotification } from "~/components/Notification/Notification.store";
import { Placeholder } from "~/components/Placeholder";
import { getBucketConfigByPath } from "~/utils/bucketConfig";
import { select, useConnectionsStore } from "~/utils/connectionsStore";
import { getFileType } from "~/utils/fileType";
import { getObjects } from "~/utils/getObjects";
import { getOffsetKeyForOmeTiff } from "~/utils/omeTiffOffsets";
import { getName, getPrefix } from "~/utils/pathUtils";
import { usePinnedPathsStore, selectIsPinned } from "~/utils/pinnedPathsStore";
import { useRecentlyViewedStore } from "~/utils/recentlyViewedStore/useRecentlyViewedStore";
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
    const provider = params.provider ?? "";
    const bucketName = params.bucketName ?? "";
    const pathName = params["*"] ?? "";
    const prefix = data?.bucketConfig?.prefix ?? "";

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

    // Build the storage connection path (bucket + prefix as atomic unit)
    const dataConnectionPath = prefix
      ? `/buckets/${provider}/${bucketName}/${prefix.replace(/\/$/, "")}`
      : `/buckets/${provider}/${bucketName}`;

    // Display name: show bucket name, or bucket/lastPrefixSegment if prefix exists
    const prefixLastSegment = prefix.replace(/\/$/, "").split("/").pop();
    const dataConnectionName = prefix
      ? `${bucketName}/${prefixLastSegment}`
      : bucketName;

    const options: CrumbsOptions = {
      dataConnectionName,
      dataConnectionPath,
    };

    return getCrumbs(`/buckets/${provider}`, relativeSegments, options);
  },
};

export interface BucketRouteLoaderResponse {
  nodes: TreeNode[];
  bucketName: string;
  pathName: string;
  name: string;
  url?: string;
  offsetsUrl?: string;
  fileSize?: number;
  fileLastModified?: string;
  notification?: NotificationInput;
  credentials: Credentials;
  bucketConfig: BucketConfig;
}

export type ObjectPresignedUrl = Readonly<_Object & { presignedUrl: string }>;

export const loader = async ({
  params,
  context,
}: ActionFunctionArgs): Promise<BucketRouteLoaderResponse> => {
  const { user, credentials: bucketsCredentials } = context.get(authContext);
  const { provider, bucketName } = params;

  if (!provider) throw new Error("Provider is required");
  if (!bucketName) throw new Error("Bucket name is required");

  const credentials = bucketsCredentials[bucketName];
  if (!credentials) throw new Error(`No credentials for bucket: ${bucketName}`);

  const pathName = params["*"] as string;
  const prefix = getPrefix(pathName);
  const name = getName(pathName, bucketName);

  const bucketConfig = await getBucketConfigByPath(
    user,
    provider,
    bucketName,
    pathName,
  );

  if (!bucketConfig) {
    throw new Error("Bucket configuration not found");
  }

  try {
    const s3Client = await getS3Client(bucketConfig, credentials, user.sub);

    const objects: Readonly<_Object>[] = await getObjects(
      bucketConfig,
      s3Client,
      undefined,
      prefix,
    );

    if (objects.length > 0) {
      const objectsWithUrls: ObjectPresignedUrl[] = await Promise.all(
        objects.map(async (obj) => ({
          ...obj,
          presignedUrl: await getPresignedUrl(bucketConfig, s3Client, obj.Key!),
        })),
      );

      const nodes = buildDirectoryTree(
        bucketName,
        objectsWithUrls,
        bucketConfig.provider,
        prefix,
      );

      return {
        credentials,
        bucketConfig,
        name,
        nodes,
        bucketName,
        pathName,
      };
    }

    const offsetKey = getOffsetKeyForOmeTiff(pathName);

    const [url, offsetsUrl, head] = await Promise.all([
      getPresignedUrl(bucketConfig, s3Client, pathName),
      offsetKey
        ? getPresignedUrl(bucketConfig, s3Client, offsetKey)
        : undefined,
      s3Client.send(
        new HeadObjectCommand({ Bucket: bucketConfig.name, Key: pathName }),
      ),
    ]);

    return {
      credentials,
      bucketConfig,
      name,
      nodes: [],
      bucketName,
      pathName,
      url,
      offsetsUrl,
      fileSize: head.ContentLength,
      fileLastModified: head.LastModified?.toISOString(),
    };
  } catch (error) {
    console.error("Error in objects loader:", error);
    return {
      credentials,
      bucketConfig,
      name,
      nodes: [],
      bucketName,
      pathName,
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
    name,
    url,
    offsetsUrl,
    fileSize,
    fileLastModified,
    nodes,
    pathName,
    bucketName,
    credentials,
    bucketConfig,
  } = useLoaderData<BucketRouteLoaderResponse>();
  useBackendNotification();
  const navigate = useNavigate();
  const setConnection = useConnectionsStore(select.setConnection);

  const { provider } = bucketConfig;

  const resourceId = createResourceId(
    bucketConfig.provider,
    bucketConfig.name,
    pathName,
  );
  const fileType = getFileType(resourceId);

  // Store credentials and bucket config in Zustand store when they're available
  // Connections are per-bucket, not per-file
  // Key format: provider/bucketName to avoid collisions across providers
  useEffect(() => {
    if (credentials && bucketName && bucketConfig) {
      const storeKey = `${bucketConfig.provider}/${bucketName}`;
      setConnection(storeKey, credentials, bucketConfig);
    }
  }, [bucketName, credentials, bucketConfig, setConnection]);

  // Track recently viewed files
  const { addItem } = useRecentlyViewedStore();
  useEffect(() => {
    if (url) {
      addItem({
        provider: bucketConfig.provider,
        bucketName: bucketConfig.name,
        pathName,
        name,
        type: "file",
        children: [],
        _Object: {
          Key: pathName,
          Size: fileSize,
          LastModified: fileLastModified
            ? new Date(fileLastModified)
            : undefined,
          presignedUrl: url,
        },
      });
    }
  }, [resourceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPinned = usePinnedPathsStore(
    selectIsPinned(provider ?? "", bucketName, pathName ?? ""),
  );
  const { addPin, removePin } = usePinnedPathsStore();

  const togglePin = useCallback(() => {
    if (!provider || !bucketName) return;
    const id = `${provider}/${bucketName}/${pathName ?? ""}`;
    if (isPinned) {
      removePin(id);
    } else {
      addPin({
        provider,
        bucketName,
        pathName: pathName ?? "",
        displayName: pathName ? getName(pathName, bucketName) : bucketName,
      });
    }
  }, [provider, bucketName, pathName, isPinned, addPin, removePin]);

  // Show directory view when there are multiple objects
  if (nodes.length > 0) {
    return (
      <DirectoryView
        name={name}
        nodes={nodes}
        provider={bucketConfig.provider}
        bucketName={bucketName}
        pathName={pathName}
      >
        <Button
          onClick={togglePin}
          theme="white"
          className="gap-2"
          aria-label={isPinned ? "Unpin directory" : "Pin directory"}
        >
          <Icon icon={isPinned ? "BookmarkCheck" : "Bookmark"} size={16} />
          {isPinned ? "Pinned" : "Pin"}
        </Button>
        <ButtonLink to="?action=cyberduck" theme="white" className="gap-2">
          <Icon icon="Download" size={16} />
          Access with Cyberduck
        </ButtonLink>
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
              <Button onClick={() => navigate(`?action=convert-overlay`)}>
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
      <Placeholder
        title="Unsupported file format."
        description="The selected file format is not supported for viewing."
        icon="Ban"
        cta={
          <Button
            onClick={() => {
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
    <Placeholder
      title="No objects found in this bucket."
      description="Try uploading some files or check your permissions."
      icon="Ban"
      cta={
        <Button
          onClick={() => {
            navigate(-1);
          }}
        >
          Go Back
        </Button>
      }
    />
  );
}
