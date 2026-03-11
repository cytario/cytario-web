import { HeadObjectCommand, NotFound } from "@aws-sdk/client-s3";
import { LoaderFunctionArgs } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getS3Client } from "~/.server/auth/getS3Client";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { getConnectionByName } from "~/utils/connectionConfig.server";
import { toIndexS3Key } from "~/utils/resourceId";

export const middleware = [requestDurationMiddleware, authMiddleware];

export const loader = async ({ params, context }: LoaderFunctionArgs) => {
  const { user, credentials: bucketsCredentials } = context.get(authContext);
  const { alias } = params;

  if (!alias) {
    return new Response("Connection alias is required", { status: 400 });
  }

  const connectionConfig = await getConnectionByName(user, alias);
  if (!connectionConfig) {
    return new Response("Connection configuration not found", { status: 404 });
  }

  const { bucketName, prefix } = connectionConfig;

  const credentials = bucketsCredentials[bucketName];
  if (!credentials) {
    return new Response("No credentials for bucket", { status: 401 });
  }

  const s3Client = await getS3Client(connectionConfig, credentials, user.sub);

  try {
    const head = await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: toIndexS3Key(prefix),
      }),
    );

    const objectCount = head.Metadata?.["object-count"]
      ? Number(head.Metadata["object-count"])
      : 0;

    return Response.json({
      exists: true,
      objectCount,
      builtAt: head.LastModified?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof NotFound) {
      return Response.json({ exists: false });
    }
    throw error;
  }
};
