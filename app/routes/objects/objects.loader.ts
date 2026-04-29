import { HeadObjectCommand, NotFound } from "@aws-sdk/client-s3";
import { Credentials } from "@aws-sdk/client-sts";
import { redirect, type LoaderFunctionArgs } from "react-router";

import { ConnectionConfig } from "~/.generated/client";
import { connectionContext } from "~/.server/connection/connectionMiddleware";
import { type NotificationInput } from "~/components/Notification/Notification.store";
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
  context,
}: LoaderFunctionArgs): Promise<BucketRouteLoaderResponse> => {
  const { connectionConfig, credentials, s3Client } =
    context.get(connectionContext);
  const { name: connectionName, bucketName } = connectionConfig;

  try {
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
