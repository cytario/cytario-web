import { PutObjectCommand } from "@aws-sdk/client-s3";
import { ActionFunctionArgs } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getS3Client } from "~/.server/auth/getS3Client";
import { buildIndexParquet } from "~/.server/reindex/buildIndex";
import { listAllObjects } from "~/.server/reindex/listAllObjects";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { getConnectionByName } from "~/utils/connectionConfig";
import { toIndexS3Key } from "~/utils/resourceId";

export const middleware = [requestDurationMiddleware, authMiddleware];

export const action = async ({
  params,
  request,
  context,
}: ActionFunctionArgs) => {
  const { user, credentials: bucketsCredentials } = context.get(authContext);
  const { provider, bucketName } = params;

  if (!provider) return new Response("Provider is required", { status: 400 });
  if (!bucketName) {
    return new Response("Bucket name is required", { status: 400 });
  }

  const credentials = bucketsCredentials[bucketName];
  if (!credentials) {
    return new Response("No credentials for bucket", { status: 401 });
  }

  const formData = await request.formData();
  const prefix = (formData.get("prefix") as string) ?? "";

  const connectionConfig = await getConnectionByName(
    user,
    provider,
    bucketName,
    prefix,
  );
  if (!connectionConfig) {
    return new Response("Connection configuration not found", { status: 404 });
  }

  const s3Client = await getS3Client(connectionConfig, credentials, user.sub);

  const objects = await listAllObjects(s3Client, bucketName, prefix);

  const parquetBuffer = await buildIndexParquet(objects);

  const key = toIndexS3Key(prefix);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: parquetBuffer,
      ContentType: "application/octet-stream",
      // Store count in metadata so HeadObjectCommand can retrieve it cheaply
      Metadata: {
        "object-count": String(objects.length),
      },
    }),
  );

  const builtAt = new Date().toISOString();
  console.info(
    `[reindex] Built index for ${provider}/${bucketName} (prefix: "${prefix}"): ${objects.length} objects at ${builtAt}`,
  );

  return Response.json({ objectCount: objects.length, builtAt });
};
