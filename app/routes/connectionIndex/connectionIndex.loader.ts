import {
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
} from "@aws-sdk/client-s3";
import { LoaderFunctionArgs } from "react-router";

import { connectionIndexFilter } from "./connectionIndexFilter";
import { authContext } from "~/.server/auth/authMiddleware";
import { getS3Client } from "~/.server/auth/getS3Client";
import { getConnection } from "~/routes/connections/connections.server";
import { toIndexS3Key } from "~/utils/resourceId";


export interface LiveSliceObject {
  key: string;
  size: number;
  etag: string;
  lastModified: string | null;
}

export interface LiveSlice {
  /** The S3 key prefix that was listed (with trailing slash, connection-prefix-prepended). */
  prefix: string;
  /** Immediate-child files at this level. Filtered by shouldIncludeInIndex. */
  objects: LiveSliceObject[];
  /** Common-prefix entries (subdirectories) at this level, as full S3 keys. */
  directories: string[];
}

interface ConnectionIndexPresent {
  connectionName: string;
  exists: true;
  objectCount: number;
  builtAt: string | null;
  sizeBytes: number | null;
  /** Present only when the request carried `?slice=...`. */
  liveSlice?: LiveSlice;
}

interface ConnectionIndexMissing {
  connectionName: string;
  exists: false;
  liveSlice?: LiveSlice;
}

export type ConnectionIndexLoaderData =
  | ConnectionIndexPresent
  | ConnectionIndexMissing;

/**
 * Probe whether a connection's parquet index exists. Cheap HeadObject; no
 * DuckDB initialization. Feeds the /connectionIndex/:connectionName page.
 *
 * When the request carries `?slice=<pathRelativeToConnectionRoot>`, we also
 * issue a `ListObjectsV2(Delimiter="/")` for that one level and return it as
 * `liveSlice` — the drift-detection hook reads this to compare against what
 * the index currently holds for the same slice.
 */
export const loader = async ({
  params,
  request,
  context,
}: LoaderFunctionArgs): Promise<ConnectionIndexLoaderData> => {
  const { user, credentials: bucketsCredentials } = context.get(authContext);
  const { connectionName } = params;

  if (!connectionName) {
    throw new Response("Connection name is required", { status: 400 });
  }

  const connectionConfig = await getConnection(user, connectionName);
  if (!connectionConfig) {
    throw new Response("Connection configuration not found", { status: 404 });
  }

  const { bucketName, prefix } = connectionConfig;

  const credentials = bucketsCredentials[bucketName];
  if (!credentials) {
    throw new Response("No credentials for bucket", { status: 401 });
  }

  const s3Client = await getS3Client(connectionConfig, credentials, user.sub);

  const sliceParam = new URL(request.url).searchParams.get("slice");
  const liveSlice =
    sliceParam !== null
      ? await fetchLiveSlice(s3Client, bucketName, prefix, sliceParam)
      : undefined;

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

    return {
      connectionName,
      exists: true,
      objectCount,
      builtAt: head.LastModified?.toISOString() ?? null,
      sizeBytes: head.ContentLength ?? null,
      ...(liveSlice && { liveSlice }),
    };
  } catch (error) {
    if (error instanceof NotFound) {
      return {
        connectionName,
        exists: false,
        ...(liveSlice && { liveSlice }),
      };
    }
    throw error;
  }
};

async function fetchLiveSlice(
  s3Client: Awaited<ReturnType<typeof getS3Client>>,
  bucketName: string,
  connectionPrefix: string,
  slice: string,
): Promise<LiveSlice> {
  const connPrefix = connectionPrefix.replace(/\/$/, "");
  const baseSlice = slice.replace(/^\/+/, "");
  const fullSlicePrefix = [connPrefix, baseSlice].filter(Boolean).join("/");
  const normalized = fullSlicePrefix
    ? fullSlicePrefix.endsWith("/")
      ? fullSlicePrefix
      : `${fullSlicePrefix}/`
    : "";

  const response = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: normalized || undefined,
      Delimiter: "/",
    }),
  );

  const seen = new Set<string>();
  const objects: LiveSliceObject[] = (response.Contents ?? [])
    .filter((obj) => connectionIndexFilter(obj, seen))
    .map((obj) => ({
      key: obj.Key ?? "",
      size: obj.Size ?? 0,
      etag: (obj.ETag ?? "").replace(/"/g, ""),
      lastModified: obj.LastModified?.toISOString() ?? null,
    }));

  const directories = (response.CommonPrefixes ?? [])
    .map((cp) => cp.Prefix ?? "")
    .filter(Boolean);

  return { prefix: normalized, objects, directories };
}
