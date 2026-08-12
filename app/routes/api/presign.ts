import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { type ActionFunctionArgs } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import {
  getProviderCatalog,
  resolveConnectionProviderWithGrants,
} from "~/.server/providers/providerCatalog.server";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { getConnection } from "~/routes/connections/connections.server";
import { getS3ProviderConfig } from "~/utils/s3Provider";

export const middleware = [requestDurationMiddleware, authMiddleware];

const DEFAULT_SIGNING_EXPIRES_SECONDS = 900;

interface PresignRequestBody {
  connectionId: string;
  url: string;
  method: string;
}

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { user, authTokens } = context.get(authContext);

  let body: PresignRequestBody;
  try {
    body = (await request.json()) as PresignRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { connectionId, url: s3Url, method } = body;
  if (!connectionId || !s3Url || !method) {
    return Response.json({ error: "connectionId, url, and method are required" }, { status: 400 });
  }

  const connectionConfig = await getConnection(user, connectionId);
  if (!connectionConfig) {
    return Response.json({ error: "Connection not found" }, { status: 404 });
  }

  let resolvedWithGrants;
  try {
    const catalog = await getProviderCatalog(connectionConfig.organization, authTokens.accessToken);
    resolvedWithGrants = resolveConnectionProviderWithGrants(catalog, connectionConfig);
  } catch {
    return Response.json({ error: "Provider catalog is unavailable" }, { status: 502 });
  }

  if (!resolvedWithGrants) {
    return Response.json({ error: "Provider connection is stale or unavailable" }, { status: 502 });
  }

  if (resolvedWithGrants.credentialMode !== "presigned") {
    return Response.json({ error: "This connection does not use presigned URLs" }, { status: 400 });
  }

  const { staticCredentials, region, endpoint } = resolvedWithGrants;
  if (!staticCredentials) {
    return Response.json(
      { error: "No static credentials configured for this presigned connection" },
      { status: 502 },
    );
  }

  const providerConfig = getS3ProviderConfig(endpoint, region);
  const s3Client = new S3Client({
    endpoint: providerConfig.s3Endpoint,
    region,
    forcePathStyle: !providerConfig.isAwsS3,
    credentials: {
      accessKeyId: staticCredentials.accessKeyId,
      secretAccessKey: staticCredentials.secretAccessKey,
    },
  });

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(s3Url);
  } catch {
    return Response.json({ error: "Invalid S3 URL" }, { status: 400 });
  }

  const pathSegments = parsedUrl.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
  const bucket = pathSegments.shift() ?? connectionConfig.bucketName;
  const key = pathSegments.join("/");

  const params = parsedUrl.searchParams;
  const upperMethod = method.toUpperCase();

  let signedUrl: string;
  try {
    if (params.get("list-type") === "2") {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: params.get("prefix") ?? undefined,
        Delimiter: params.get("delimiter") ?? undefined,
        MaxKeys: params.get("max-keys") ? Number(params.get("max-keys")) : undefined,
        ContinuationToken: params.get("continuation-token") ?? undefined,
      });
      signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: DEFAULT_SIGNING_EXPIRES_SECONDS,
      });
    } else if (upperMethod === "PUT") {
      const command = new PutObjectCommand({ Bucket: bucket, Key: key });
      signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: DEFAULT_SIGNING_EXPIRES_SECONDS,
      });
    } else {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: DEFAULT_SIGNING_EXPIRES_SECONDS,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to presign URL";
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json(
    { url: signedUrl },
    {
      headers: { "Cache-Control": "no-store, private" },
    },
  );
};
