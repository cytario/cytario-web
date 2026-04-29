import { ActionFunctionArgs } from "react-router";

import { authMiddleware } from "~/.server/auth/authMiddleware";
import { getPresignedUrl } from "~/.server/auth/getPresignedUrl";
import {
  connectionContext,
  connectionMiddleware,
} from "~/.server/connection/connectionMiddleware";
import { createLabel } from "~/.server/logging";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";

export const middleware = [
  requestDurationMiddleware,
  authMiddleware,
  connectionMiddleware,
];

const label = createLabel("presign", "gray");

export const loader = async ({
  params,
  context,
}: ActionFunctionArgs): Promise<Response> => {
  const { connectionConfig, s3Client } = context.get(connectionContext);
  const pathName = params["*"] ?? "";

  const { provider, bucketName, prefix: connPrefix } = connectionConfig;
  const s3Key = connPrefix
    ? `${connPrefix.replace(/\/$/, "")}/${pathName}`
    : pathName;
  console.info(`${label} Presign route: ${provider}/${bucketName}/${s3Key}`);

  try {
    const presignedUrl = await getPresignedUrl(
      connectionConfig,
      s3Client,
      s3Key,
    );

    return Response.json({ url: presignedUrl });
  } catch (error) {
    console.error("Error presigning url", error);
    return Response.json(
      { error: "Failed to generate presigned URL" },
      { status: 500 },
    );
  }
};
