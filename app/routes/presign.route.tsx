import { ActionFunctionArgs } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getPresignedUrl } from "~/.server/auth/getPresignedUrl";
import { getS3Client } from "~/.server/auth/getS3Client";
import { createLabel } from "~/.server/logging";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { getBucketConfigByName } from "~/utils/bucketConfig";

export const middleware = [requestDurationMiddleware, authMiddleware];

const label = createLabel("presign", "gray");

export const loader = async ({
  params,
  context,
}: ActionFunctionArgs): Promise<Response> => {
  const { user, credentials: bucketsCredentials } = context.get(authContext);
  const { provider, bucketName } = params;
  const pathName = params["*"] as string;
  if (!bucketName) throw new Error("Bucket name is required");

  console.info(`${label} Presign route: ${provider}/${bucketName}/${pathName}`);

  const credentials = bucketName && bucketsCredentials[bucketName];

  if (!provider) throw new Error("Provider is required");

  const bucketConfig = await getBucketConfigByName(user, provider, bucketName);

  if (!bucketConfig) {
    throw new Error("Bucket configuration not found");
  }

  try {
    const s3Client = await getS3Client(bucketConfig, credentials, user.sub);
    const presignedUrl = await getPresignedUrl(
      bucketConfig,
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
