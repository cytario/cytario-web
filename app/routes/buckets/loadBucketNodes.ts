import { ActionFunctionArgs } from "react-router";

import { BucketConfig } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { getPresignedUrl } from "~/.server/auth/getPresignedUrl";
import { getS3Client } from "~/.server/auth/getS3Client";
import { getManageableScopes } from "~/.server/auth/keycloakAdmin";
import { SessionCredentials } from "~/.server/auth/sessionStorage";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { ObjectPresignedUrl } from "~/routes/objects.route";
import { getObjects } from "~/utils/getObjects";
import { isOmeTiff } from "~/utils/omeTiffOffsets";

const fetchPreviewObject = async (
  config: BucketConfig,
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

export async function loadBucketNodes(context: ActionFunctionArgs["context"]) {
  const { bucketConfigs, credentials, user, authTokens } =
    context.get(authContext);
  const userId = user.sub;

  const [previews, adminScopes] = await Promise.all([
    Promise.allSettled(
      bucketConfigs.map((config) =>
        fetchPreviewObject(config, credentials, userId),
      ),
    ),
    getManageableScopes(user, authTokens.accessToken).catch((error) => {
      console.error("Failed to fetch manageable scopes:", error);
      return [] as string[];
    }),
  ]);

  const nodes: TreeNode[] = bucketConfigs.map((config, i) => {
    const result = previews[i];
    const previewObj = result.status === "fulfilled" ? result.value : undefined;

    const prefixLastSegment = config.prefix
      ?.replace(/\/$/, "")
      .split("/")
      .pop();
    const displayName = config.prefix
      ? `${config.name}/${prefixLastSegment}`
      : config.name;

    return {
      bucketName: config.name,
      name: displayName,
      type: "bucket" as const,
      provider: config.provider,
      pathName: config.prefix || undefined,
      children: [],
      _Object: previewObj,
    };
  });

  return { nodes, adminScopes, userId, credentials, bucketConfigs };
}
