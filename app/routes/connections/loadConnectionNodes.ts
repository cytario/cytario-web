import { ActionFunctionArgs } from "react-router";

import { ConnectionConfig } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { getPresignedUrl } from "~/.server/auth/getPresignedUrl";
import { getS3Client } from "~/.server/auth/getS3Client";
import { getManageableScopes } from "~/.server/auth/keycloakAdmin";
import { SessionCredentials } from "~/.server/auth/sessionStorage";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { ObjectPresignedUrl } from "~/routes/objects.route";
import { getObjects } from "~/utils/getObjects";
import { isOmeTiff } from "~/utils/omeTiffOffsets";
import { getPinnedPaths } from "~/utils/pinnedPaths.server";
import { getRecentlyViewed } from "~/utils/recentlyViewed.server";

const fetchPreviewObject = async (
  config: ConnectionConfig,
  credentials: SessionCredentials,
  userId: string,
): Promise<ObjectPresignedUrl | undefined> => {
  const creds = credentials[config.name];
  if (!creds) return undefined;
  const s3 = await getS3Client(config, creds, userId);
  const objects = await getObjects(
    config,
    s3,
    null,
    config.prefix || undefined,
    100,
  );
  const preview = objects.find((obj) => isOmeTiff(obj.Key ?? ""));
  if (!preview?.Key) return undefined;
  const presignedUrl = await getPresignedUrl(config, s3, preview.Key);
  return { ...preview, presignedUrl } as ObjectPresignedUrl;
};

export type SerializedRecentlyViewed = {
  id: number;
  provider: string;
  bucketName: string;
  pathName: string;
  name: string;
  type: string;
  viewedAt: string;
};

export type SerializedPinnedPath = {
  id: number;
  provider: string;
  bucketName: string;
  pathName: string;
  displayName: string;
  totalSize: number | null;
  lastModified: string | null;
};

export async function loadConnectionNodes(context: ActionFunctionArgs["context"]) {
  const { connectionConfigs, credentials, user, authTokens } =
    context.get(authContext);
  const userId = user.sub;

  const [previews, adminScopes, recentlyViewedRaw, pinnedPathsRaw] =
    await Promise.all([
      Promise.allSettled(
        connectionConfigs.map((config) =>
          fetchPreviewObject(config, credentials, userId),
        ),
      ),
      getManageableScopes(user, authTokens.accessToken).catch((error) => {
        console.error("Failed to fetch manageable scopes:", error);
        return [] as string[];
      }),
      getRecentlyViewed(userId, 20),
      getPinnedPaths(userId),
    ]);

  const nodes: TreeNode[] = connectionConfigs.map((config, i) => {
    const result = previews[i];
    const previewObj = result.status === "fulfilled" ? result.value : undefined;

    return {
      alias: config.alias,
      bucketName: config.name,
      name: config.alias,
      type: "bucket" as const,
      provider: config.provider,
      pathName: config.prefix || undefined,
      children: [],
      _Object: previewObj,
    };
  });

  const recentlyViewed: SerializedRecentlyViewed[] = recentlyViewedRaw.map(
    (item) => ({
      id: item.id,
      provider: item.provider,
      bucketName: item.bucketName,
      pathName: item.pathName,
      name: item.name,
      type: item.type,
      viewedAt: item.viewedAt.toISOString(),
    }),
  );

  const pinnedPaths: SerializedPinnedPath[] = pinnedPathsRaw.map((pin) => ({
    id: pin.id,
    provider: pin.provider,
    bucketName: pin.bucketName,
    pathName: pin.pathName,
    displayName: pin.displayName,
    totalSize: pin.totalSize != null ? Number(pin.totalSize) : null,
    lastModified: pin.lastModified ? pin.lastModified.toISOString() : null,
  }));

  return {
    nodes,
    adminScopes,
    userId,
    credentials,
    connectionConfigs,
    recentlyViewed,
    pinnedPaths,
  };
}
