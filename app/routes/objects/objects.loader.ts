import { _Object } from "@aws-sdk/client-s3";
import { Credentials } from "@aws-sdk/client-sts";
import { type LoaderFunctionArgs } from "react-router";

import { ConnectionConfig } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { getS3Client } from "~/.server/auth/getS3Client";
import {
  buildDirectoryTree,
  TreeNode,
} from "~/components/DirectoryView/buildDirectoryTree";
import { type NotificationInput } from "~/components/Notification/Notification.store";
import { getConnection } from "~/routes/connections/connections.server";
import { getObjects } from "~/utils/getObjects";
import { getName, getPrefix } from "~/utils/pathUtils";
import { checkIsPinnedPath } from "~/utils/pinnedPaths.server";
import { isZarrPath } from "~/utils/zarrUtils";

export interface BucketRouteLoaderResponse {
  connectionName: string;
  nodes: TreeNode[];
  bucketName: string;
  /** URL path segment after /connections/:name/ (relative to connection root) */
  urlPath: string;
  /** Full S3 key (connection prefix + urlPath) */
  pathName: string;
  name: string;
  /** True when navigating to a single viewable file (not a directory listing) */
  isSingleFile?: boolean;
  notification?: NotificationInput;
  credentials: Credentials;
  connectionConfig: ConnectionConfig;
  isPinned: boolean;
}

export const loader = async ({
  params,
  context,
}: LoaderFunctionArgs): Promise<BucketRouteLoaderResponse> => {
  const { user, credentials: connectionsCredentials } =
    context.get(authContext);
  const { name: connectionName } = params;

  if (!connectionName) throw new Error("Connection name is required");

  const connectionConfig = await getConnection(user, connectionName);
  if (!connectionConfig) {
    throw new Error("Connection configuration not found");
  }

  const { bucketName } = connectionConfig;

  const credentials = connectionsCredentials[connectionName];
  if (!credentials)
    throw new Error(`No credentials for connection: ${connectionName}`);

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

    // Check for zarr before listing objects — zarr directories can contain
    // thousands of chunk files, so we skip the expensive ListObjects call.
    if (isZarrPath(pathName)) {
      return {
        credentials,
        connectionConfig,
        isPinned,
        name,
        nodes: [],
        bucketName,
        connectionName,
        pathName,
        urlPath,
        isSingleFile: true,
      };
    }

    const objects: Readonly<_Object>[] = await getObjects(
      connectionConfig,
      s3Client,
      undefined,
      prefix,
    );

    if (objects.length > 0) {
      const nodes = buildDirectoryTree(
        objects,
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

    // Single file — viewer or unsupported format
    return {
      connectionName,
      credentials,
      connectionConfig,
      name,
      nodes: [],
      bucketName,
      urlPath,
      pathName,
      isSingleFile: true,
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
