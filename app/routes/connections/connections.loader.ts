import { _Object } from "@aws-sdk/client-s3";
import { Credentials } from "@aws-sdk/client-sts";
import { type LoaderFunctionArgs } from "react-router";

import { ConnectionConfig } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { getS3Client } from "~/.server/auth/getS3Client";
import { SessionCredentials } from "~/.server/auth/sessionStorage";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { isImageFile } from "~/utils/fileType";
import { getObjects } from "~/utils/getObjects";
import { getPinnedPaths } from "~/utils/pinnedPaths.server";
import { getRecentlyViewed } from "~/utils/recentlyViewed.server";

/** Find the first image file in a connection for the bucket card preview. */
const fetchPreviewObject = async (
  config: ConnectionConfig,
  credentials: SessionCredentials,
  userId: string,
): Promise<_Object | undefined> => {
  const creds = credentials[config.bucketName];
  if (!creds) return undefined;
  const s3 = await getS3Client(config, creds, userId);
  const objects = await getObjects(
    config,
    s3,
    null,
    config.prefix || undefined,
    100,
  );
  return objects.find((obj) => isImageFile(obj.Key ?? ""));
};

export type SerializedRecentlyViewed = {
  id: number;
  connectionName: string;
  pathName: string;
  name: string;
  type: string;
  viewedAt: string;
};

export type SerializedPinnedPath = {
  id: number;
  connectionName: string;
  pathName: string;
  displayName: string;
  totalSize: number | null;
  lastModified: string | null;
};

export interface LoaderData {
  nodes: TreeNode[];
  credentials: Record<string, Credentials>;
  connectionConfigs: ConnectionConfig[];
  recentlyViewed: SerializedRecentlyViewed[];
  pinnedPaths: SerializedPinnedPath[];
}

export async function loadConnections({
  context,
}: LoaderFunctionArgs) {
  const { connectionConfigs, credentials, user } = context.get(authContext);
  const userId = user.sub;

  const [previews, recentlyViewedRaw, pinnedPathsRaw] = await Promise.all([
    Promise.allSettled(
      connectionConfigs.map((config) =>
        fetchPreviewObject(config, credentials, userId),
      ),
    ),
    getRecentlyViewed(userId, 20),
    getPinnedPaths(userId),
  ]);

  const nodes: TreeNode[] = connectionConfigs.map((config, i) => {
    const result = previews[i];
    const previewObj = result.status === "fulfilled" ? result.value : undefined;

    return {
      connectionName: config.name,
      bucketName: config.bucketName,
      name: config.name,
      type: "bucket" as const,
      provider: config.provider,
      pathName: undefined,
      children: [],
      _Object: previewObj,
    };
  });

  const recentlyViewed: SerializedRecentlyViewed[] = recentlyViewedRaw.map(
    (item) => ({
      id: item.id,
      connectionName: item.connectionName,
      pathName: item.pathName,
      name: item.name,
      type: item.type,
      viewedAt: item.viewedAt.toISOString(),
    }),
  );

  const pinnedPaths: SerializedPinnedPath[] = pinnedPathsRaw.map((pin) => ({
    id: pin.id,
    connectionName: pin.connectionName,
    pathName: pin.pathName,
    displayName: pin.displayName,
    totalSize: pin.totalSize != null ? Number(pin.totalSize) : null,
    lastModified: pin.lastModified ? pin.lastModified.toISOString() : null,
  }));

  return {
    nodes,
    credentials,
    connectionConfigs,
    recentlyViewed,
    pinnedPaths,
  } satisfies LoaderData;
}
