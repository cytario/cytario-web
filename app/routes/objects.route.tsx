import { _Object } from "@aws-sdk/client-s3";
import { Credentials } from "@aws-sdk/client-sts";
import { addDecoder } from "geotiff";
import { lazy, Suspense, useEffect } from "react";
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
import { LZWDecoder } from "~/components/.client/ImageViewer/state/lzwDecoder";
import { getCrumbs } from "~/components/Breadcrumbs/getCrumbs";
import { ClientOnly } from "~/components/ClientOnly";
import { Button } from "~/components/Controls/Button";
import { DataGrid } from "~/components/DataGrid/DataGrid";
import {
  buildDirectoryTree,
  TreeNode,
} from "~/components/DirectoryView/buildDirectoryTree";
import { buildIndex } from "~/components/DirectoryView/buildIndex";
import DirectoryView from "~/components/DirectoryView/DirectoryView";
import { IndexStatus } from "~/components/DirectoryView/IndexStatus";
import { listPrefix } from "~/components/DirectoryView/queryIndex";
import { useIndexStore } from "~/components/DirectoryView/useIndexStore";
import { NotificationInput } from "~/components/Notification/Notification";
import { useBackendNotification } from "~/components/Notification/Notification.store";
import { Placeholder } from "~/components/Placeholder";
import { getBucketConfigByName } from "~/utils/bucketConfig";
import { useCredentialsStore } from "~/utils/credentialsStore/useCredentialsStore";
import { getObjects } from "~/utils/getObjects";
import {
  createResourceId,
  getFileName,
  getPrefix,
  matchesExtension,
} from "~/utils/resourceId";

// Lazy load Viewer to prevent SSR issues with client-only code
const Viewer = lazy(() =>
  import("~/components/.client/ImageViewer/components/ImageViewer").then(
    (module) => ({ default: module.Viewer })
  )
);

/**
 * Add LZW decoder for GeoTIFF files.
 * @url https://github.com/vitessce/vitessce/issues/1709#issuecomment-2960537868
 */
addDecoder(5, () => LZWDecoder);
// TODO: Uncomment when JPEGDecoder is available
// addDecoder(7, () => JPEGDecoder);

export const middleware = [requestDurationMiddleware, authMiddleware];

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => [
  { title: loaderData?.name ?? "Cytario" },
];

export const handle = {
  breadcrumb: (obj: ActionFunctionArgs) => {
    const { params } = obj;
    const provider = params.provider ?? "";
    const bucketName = params.bucketName ?? "";
    const pathName = params["*"];
    const pathSegments = pathName ? pathName.split("/") : [];
    return getCrumbs(`/buckets/${provider}`, [bucketName, ...pathSegments]);
  },
};

export interface BucketRouteLoaderResponse {
  nodes: TreeNode[];
  bucketName: string;
  pathName: string;
  name: string;
  url?: string;
  notification?: NotificationInput;
  credentials: Credentials;
  bucketConfig: BucketConfig;
}

export const loader = async ({
  params,
  context,
}: ActionFunctionArgs): Promise<BucketRouteLoaderResponse> => {
  const { user, credentials: bucketsCredentials } = context.get(authContext);
  const { sub: userId } = user;
  const { provider, bucketName } = params;

  const credentials = bucketName && bucketsCredentials[bucketName];

  if (!provider) throw new Error("Provider is required");
  if (!bucketName) throw new Error("Bucket name is required");

  const pathName = params["*"] as string;
  const prefix = getPrefix(pathName);
  const resourceId = createResourceId(provider, bucketName, pathName);
  const name = getFileName(resourceId) || bucketName;

  const bucketConfig = await getBucketConfigByName(
    userId,
    provider,
    bucketName
  );

  if (!bucketConfig) {
    throw new Error("Bucket configuration not found");
  }

  try {
    const s3Client = await getS3Client(bucketConfig, credentials, userId);

    const objects: Readonly<_Object>[] = await getObjects(
      bucketConfig,
      s3Client,
      undefined,
      prefix
    );

    if (objects.length > 0) {
      // Pass objects directly - presigned URLs are lazy-loaded by thumbnails
      const resourceId = `${provider}/${bucketName}`;
      const nodes = buildDirectoryTree(resourceId, objects, prefix);

      return {
        credentials,
        bucketConfig,
        name,
        nodes,
        bucketName,
        pathName,
      };
    }

    const url = await getPresignedUrl(bucketConfig, s3Client, pathName);

    return {
      credentials,
      bucketConfig,
      name,
      nodes: [],
      bucketName,
      pathName,
      url,
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

/**
 * Client loader for instant navigation when DuckDB index is available.
 * Falls back to server loader when index is not ready.
 */
export async function clientLoader({
  params,
  serverLoader,
}: {
  params: Record<string, string | undefined>;
  serverLoader: () => Promise<BucketRouteLoaderResponse>;
}): Promise<BucketRouteLoaderResponse> {
  const { provider, bucketName } = params;
  const pathName = params["*"] ?? "";
  const bucketKey = `${provider}/${bucketName}`;

  // Check if index is ready for this bucket
  const store = useIndexStore.getState();
  if (!store.hasIndex(bucketKey)) {
    // Fall back to server loader (SSR)
    return serverLoader();
  }

  // Get credentials and bucket config from Zustand store
  const credentialsStore = useCredentialsStore.getState();
  const credentials = credentialsStore.getCredentials(bucketKey);
  const clientBucketConfig = credentialsStore.getBucketConfig(bucketKey);

  if (!credentials || !clientBucketConfig) {
    // No stored credentials, fall back to server loader
    return serverLoader();
  }

  // Query index for instant navigation
  const prefix = getPrefix(pathName);
  const entries = await listPrefix(bucketKey, prefix ?? "");

  // If no entries found, fall back to server loader (might be a file)
  if (entries.length === 0) {
    return serverLoader();
  }

  const nodes = buildDirectoryTree(bucketKey, entries, prefix);

  const resourceId = createResourceId(provider!, bucketName!, pathName);
  const name = getFileName(resourceId) || bucketName!;

  // Use the stored bucket config directly (has full data from server)
  const bucketConfig = clientBucketConfig;

  return {
    nodes,
    bucketName: bucketName!,
    pathName,
    name,
    credentials,
    bucketConfig,
  };
}

export default function ObjectsRoute() {
  const { name, url, nodes, pathName, bucketName, credentials, bucketConfig } =
    useLoaderData<BucketRouteLoaderResponse>();
  useBackendNotification();
  const navigate = useNavigate();
  const { setCredentials } = useCredentialsStore();
  const { hasIndex, isBuilding } = useIndexStore();

  const bucketKey = `${bucketConfig.provider}/${bucketName}`;
  const resourceId = createResourceId(
    bucketConfig.provider,
    bucketConfig.name,
    pathName
  );

  // Store credentials and bucket config in Zustand store when they're available
  // Credentials are per-bucket, not per-file
  // Key format: provider/bucketName to avoid collisions across providers
  useEffect(() => {
    if (credentials && bucketName && bucketConfig) {
      setCredentials(bucketKey, credentials, bucketConfig);
    }
  }, [bucketName, credentials, bucketConfig, bucketKey, setCredentials]);

  // Build index for bucket on first navigation
  useEffect(() => {
    if (credentials && bucketName && bucketConfig) {
      // Only build if not already building or ready
      if (!hasIndex(bucketKey) && !isBuilding(bucketKey)) {
        buildIndex(bucketKey, bucketName, credentials, bucketConfig).catch(
          (error) => {
            console.error(`[ObjectsRoute] Failed to build index:`, error);
          }
        );
      }
    }
  }, [bucketKey, bucketName, credentials, bucketConfig, hasIndex, isBuilding]);

  // Show directory view when there are multiple objects
  if (nodes.length > 0) {
    return (
      <DirectoryView
        name={name}
        nodes={nodes}
        provider={bucketConfig.provider}
        bucketName={bucketName}
        pathName={pathName}
        headerActions={<IndexStatus bucketKey={bucketKey} />}
      />
    );
  }

  // Open file viewer when a single file is selected
  if (url) {
    const isCsv = matchesExtension(resourceId, /\.csv$/i);
    const isTabularFile = matchesExtension(
      resourceId,
      /\.(csv|parquet|json|ndjson)$/i
    );

    if (isTabularFile) {
      return (
        <div className="flex flex-col h-full">
          {isCsv && (
            <header className="flex items-center justify-between p-4 bg-rose-300">
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

    if (matchesExtension(resourceId, /\.(tif|tiff)$/i)) {
      return (
        <ClientOnly>
          <Suspense fallback={<div>Loading viewer...</div>}>
            <Viewer resourceId={resourceId} url={url} />
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
