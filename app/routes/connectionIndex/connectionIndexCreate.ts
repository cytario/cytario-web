import {
  _Object,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { DuckDBInstance } from "@duckdb/node-api";
import { randomUUID } from "crypto";
import { readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { ActionFunctionArgs, redirect } from "react-router";

import { connectionIndexFilter } from "./connectionIndexFilter";
import { authContext } from "~/.server/auth/authMiddleware";
import { getS3Client } from "~/.server/auth/getS3Client";
import { getConnection } from "~/routes/connections/connections.server";
import { toIndexS3Key } from "~/utils/resourceId";


/**
 * HTTP POST handler for `/connectionIndex/:connectionName`.
 *
 * Full (re)build of the index: walks the whole S3 prefix, applies the
 * connectionIndex filter, builds a parquet with DuckDB node-api, uploads to
 * `<prefix>/.cytario/index.parquet`. Idempotent; no `canModify` gate (reads
 * and writes only data the caller already has access to).
 *
 * Redirects on success so the page's <Form method="POST"> lands the user on
 * /connections/:name. Fetcher-driven submissions don't navigate on redirect
 * — they just revalidate.
 */
export const connectionIndexCreate = async ({
  params,
  context,
}: ActionFunctionArgs) => {
  const { user, credentials: bucketsCredentials } = context.get(authContext);
  const { connectionName } = params;

  if (!connectionName) {
    return new Response("Connection name is required", { status: 400 });
  }

  const connectionConfig = await getConnection(user, connectionName);
  if (!connectionConfig) {
    return new Response("Connection configuration not found", { status: 404 });
  }

  const { provider, bucketName, prefix } = connectionConfig;

  const credentials = bucketsCredentials[bucketName];
  if (!credentials) {
    return new Response("No credentials for bucket", { status: 401 });
  }

  try {
    const s3Client = await getS3Client(connectionConfig, credentials, user.sub);

    const objects = await fetchIndexableObjects(s3Client, bucketName, prefix);
    const parquetBuffer = await buildIndexParquet(objects);

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: toIndexS3Key(prefix),
        Body: parquetBuffer,
        ContentType: "application/octet-stream",
        Metadata: {
          "object-count": String(objects.length),
        },
      }),
    );

    console.info(
      `[connectionIndex] Created for ${provider}/${bucketName} (prefix: "${prefix}"): ${objects.length} objects`,
    );

    return redirect(`/connections/${encodeURIComponent(connectionName)}`);
  } catch (error) {
    console.error(
      `[connectionIndex] Create failed for ${provider}/${bucketName}:`,
      error,
    );
    return new Response("Indexing failed", { status: 500 });
  }
};

/**
 * Paginated ListObjectsV2 + `connectionIndexFilter`. Returns every object
 * under `prefix` minus zarr chunks (one kept per root) and `.cytario/`
 * contents.
 */
async function fetchIndexableObjects(
  s3Client: S3Client,
  bucketName: string,
  prefix = "",
  maxObjects = 500_000,
): Promise<_Object[]> {
  const objects: _Object[] = [];
  const seenZarrRoots = new Set<string>();
  let continuationToken: string | undefined;

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix || undefined,
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of response.Contents ?? []) {
      if (connectionIndexFilter(obj, seenZarrRoots)) {
        objects.push(obj);
      }
    }

    if (objects.length >= maxObjects) {
      console.warn(
        `[connectionIndexCreate] Hit max object limit (${maxObjects}) for ${bucketName}/${prefix}`,
      );
      break;
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}

/**
 * Turn a list of S3 objects into a ZSTD-compressed parquet buffer.
 * Schema: key (VARCHAR), size (BIGINT), last_modified (TIMESTAMP), etag (VARCHAR).
 */
async function buildIndexParquet(objects: _Object[]): Promise<Buffer> {
  const id = randomUUID();
  const parquetPath = join(tmpdir(), `cytario-${id}.parquet`);

  if (parquetPath.includes("'")) {
    throw new Error(
      "Temp file path contains single quote — cannot safely interpolate into SQL",
    );
  }

  try {
    const instance = await DuckDBInstance.create();
    const connection = await instance.connect();

    await connection.run(/* sql */ `
      CREATE TABLE objects (
        key VARCHAR,
        size BIGINT,
        last_modified TIMESTAMP,
        etag VARCHAR
      )
    `);

    if (objects.length > 0) {
      const jsonPath = join(tmpdir(), `cytario-${id}.json`);

      if (jsonPath.includes("'")) {
        throw new Error(
          "Temp file path contains single quote — cannot safely interpolate into SQL",
        );
      }

      try {
        const jsonData = objects.map((obj) => ({
          key: obj.Key ?? "",
          size: obj.Size ?? 0,
          last_modified: obj.LastModified?.toISOString() ?? null,
          etag: (obj.ETag ?? "").replace(/"/g, ""),
        }));

        await writeFile(jsonPath, JSON.stringify(jsonData));

        await connection.run(
          /* sql */ `INSERT INTO objects SELECT * FROM read_json_auto('${jsonPath}')`,
        );
      } finally {
        await unlink(jsonPath).catch(() => {});
      }
    }

    await connection.run(
      /* sql */ `COPY (SELECT * FROM objects ORDER BY key) TO '${parquetPath}' (FORMAT PARQUET, COMPRESSION ZSTD)`,
    );

    return await readFile(parquetPath);
  } finally {
    await unlink(parquetPath).catch(() => {});
  }
}
