import { HeadObjectCommand, NotFound } from "@aws-sdk/client-s3";
import { Credentials } from "@aws-sdk/client-sts";
import { redirect, type LoaderFunctionArgs } from "react-router";

import { ConnectionConfig } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { getS3Client } from "~/.server/auth/getS3Client";
import { type NotificationInput } from "~/components/Notification/Notification.store";
import { getConnection } from "~/routes/connections/connections.server";
import { toIndexS3Key } from "~/utils/resourceId";

/**
 * Connection-stable loader data — returned once per connection, not per path.
 * Path-derived state (urlPath, pathName, name, isPinned) is computed in the
 * route component from `useParams()` so client-side navigation within a
 * connection doesn't need to re-run the loader.
 */
export interface BucketRouteLoaderResponse {
  connectionName: string;
  bucketName: string;
  credentials: Credentials;
  connectionConfig: ConnectionConfig;
  notification?: NotificationInput;
}

export const loader = async ({
  params,
  context,
}: LoaderFunctionArgs): Promise<BucketRouteLoaderResponse> => {
  const { user, credentials: connectionsCredentials } =
    context.get(authContext);
  const { name: connectionName } = params;

  if (!connectionName) throw new Error("Connection name is required");

  const connectionConfig = await getConnection(user, connectionName);
  if (!connectionConfig) {
    throw new Error("Connection configuration not found");
  }

  const { bucketName } = connectionConfig;

  const credentials = connectionsCredentials[connectionName];
  if (!credentials)
    throw new Error(`No credentials for connection: ${connectionName}`);

  try {
    const s3Client = await getS3Client(connectionConfig, credentials, user.sub);

    // Probe the parquet index. On miss, redirect to the index page where the
    // user can kick off the build explicitly. We do not auto-build here —
    // large buckets would block navigation for seconds with no feedback.
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: toIndexS3Key(connectionConfig.prefix),
      }),
    );

    return {
      connectionName,
      bucketName,
      credentials,
      connectionConfig,
    };
  } catch (error) {
    if (error instanceof NotFound) {
      throw redirect(`/connectionIndex/${encodeURIComponent(connectionName)}`);
    }
    console.error("Error in objects loader:", error);
    return {
      connectionName,
      bucketName,
      credentials,
      connectionConfig,
      notification: {
        message:
          "We couldn't check the index for this connection. Please try again later.",
        status: "error",
      },
    };
  }
};
