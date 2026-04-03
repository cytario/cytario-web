import { Credentials } from "@aws-sdk/client-sts";
import { type LoaderFunctionArgs } from "react-router";

import { ConnectionConfig } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { getPresignedUrl } from "~/.server/auth/getPresignedUrl";
import { getS3Client } from "~/.server/auth/getS3Client";
import { SessionCredentials } from "~/.server/auth/sessionStorage";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { ObjectPresignedUrl } from "~/routes/objects.route";
import { isImageFile } from "~/utils/fileType";
import { getObjects } from "~/utils/getObjects";
import { getPinnedPaths } from "~/utils/pinnedPaths.server";
import { getRecentlyViewed } from "~/utils/recentlyViewed.server";
import { isZarrPath } from "~/utils/zarrUtils";

const fetchPreviewObject = async (
  config: ConnectionConfig,
  credentials: SessionCredentials,
  userId: string,
): Promise<ObjectPresignedUrl | undefined> => {
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
  const preview = objects.find((obj) => isImageFile(obj.Key ?? ""));
  if (!preview?.Key) return undefined;
  const presignedUrl = await getPresignedUrl(config, s3, preview.Key);
  return { ...preview, presignedUrl } as ObjectPresignedUrl;
};

export type SerializedRecentlyViewed = {
  id: number;
  connectionName: string;
  pathName: string;
  name: string;
  type: string;
  viewedAt: string;
  /** Full S3 key (connection prefix + pathName) */
  s3Key?: string;
  presignedUrl?: string;
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

  const configByName = new Map<string, ConnectionConfig>();
  for (const c of connectionConfigs) configByName.set(c.name, c);

  const recentlyViewed: SerializedRecentlyViewed[] = await Promise.all(
    recentlyViewedRaw.map(async (item) => {
      const base: SerializedRecentlyViewed = {
        id: item.id,
        connectionName: item.connectionName,
        pathName: item.pathName,
        name: item.name,
        type: item.type,
        viewedAt: item.viewedAt.toISOString(),
      };

      // Generate presigned URL for file items so previews work on the home page.
      // Zarr files use SigV4 credentials from the connections store instead.
      if (item.type !== "file" || isZarrPath(item.pathName)) return base;
      const config = configByName.get(item.connectionName);
      if (!config) return base;
      const creds = credentials[config.bucketName];
      if (!creds) return base;

      try {
        const connPrefix = config.prefix?.replace(/\/$/, "") ?? "";
        const s3Key = connPrefix
          ? item.pathName
            ? `${connPrefix}/${item.pathName}`
            : connPrefix
          : item.pathName;
        const s3 = await getS3Client(config, creds, userId);
        const presignedUrl = await getPresignedUrl(config, s3, s3Key);
        return { ...base, s3Key, presignedUrl };
      } catch {
        return base;
      }
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
  };
}
