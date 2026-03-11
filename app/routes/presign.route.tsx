import { ActionFunctionArgs } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getPresignedUrl } from "~/.server/auth/getPresignedUrl";
import { getS3Client } from "~/.server/auth/getS3Client";
import { createLabel } from "~/.server/logging";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { getConnectionByName } from "~/utils/connectionConfig.server";

export const middleware = [requestDurationMiddleware, authMiddleware];

const label = createLabel("presign", "gray");

export const loader = async ({
  params,
  context,
}: ActionFunctionArgs): Promise<Response> => {
  const { user, credentials: bucketsCredentials } = context.get(authContext);
  const { name: connectionName } = params;
  const pathName = params["*"] ?? "";

  if (!connectionName) throw new Error("Connection name is required");

  const connectionConfig = await getConnectionByName(user, connectionName);
  if (!connectionConfig) {
    throw new Error("Connection configuration not found");
  }

  const { provider, bucketName } = connectionConfig;
  console.info(`${label} Presign route: ${provider}/${bucketName}/${pathName}`);

  const credentials = bucketsCredentials[bucketName];
  if (!credentials) throw new Error(`No credentials for bucket: ${bucketName}`);

  try {
    const s3Client = await getS3Client(connectionConfig, credentials, user.sub);
    const presignedUrl = await getPresignedUrl(
      connectionConfig,
      s3Client,
      pathName
    );

    return Response.json({ url: presignedUrl });
  } catch (error) {
    console.error("Error presigning url", error);
    return Response.json(
      { error: "Failed to generate presigned URL" },
      { status: 500 }
    );
  }
};
