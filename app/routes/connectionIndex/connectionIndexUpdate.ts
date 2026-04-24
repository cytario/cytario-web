import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { DuckDBInstance } from "@duckdb/node-api";
import { randomUUID } from "crypto";
import { readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { ActionFunctionArgs } from "react-router";

import { connectionIndexFilter } from "./connectionIndexFilter";
import { authContext } from "~/.server/auth/authMiddleware";
import { getS3Client } from "~/.server/auth/getS3Client";
import { getConnection } from "~/routes/connections/connections.server";
import { toIndexS3Key } from "~/utils/resourceId";


/**
 * HTTP PATCH handler for `/connectionIndex/:connectionName?slice=<path>`.
 *
 * Replaces only the immediate-children rows of a single slice in the parquet
 * index, leaving everything else untouched. Used by the drift-detection path
 * to heal a stale slice without re-listing the whole bucket.
 *
 * `slice` comes from the `?slice=` query param and is the path relative to
 * the connection root (e.g. "foo/bar/" or ""). Combined with the connection's
 * prefix it forms the full S3 prefix whose depth-1 children get replaced.
 *
 * Returns JSON — never redirects (fetcher callers expect JSON; the page form
 * doesn't PATCH).
 */
export const connectionIndexUpdate = async ({
  params,
  request,
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

  const { provider, bucketName, prefix: connectionPrefix } = connectionConfig;

  const credentials = bucketsCredentials[bucketName];
  if (!credentials) {
    return new Response("No credentials for bucket", { status: 401 });
  }

  const slice = new URL(request.url).searchParams.get("slice") ?? "";

  const connPrefix = connectionPrefix.replace(/\/$/, "");
  const baseSlice = slice.replace(/^\/+/, "");
  const fullSlicePrefix = [connPrefix, baseSlice].filter(Boolean).join("/");
  const normalizedSlice = fullSlicePrefix
    ? fullSlicePrefix.endsWith("/")
      ? fullSlicePrefix
      : `${fullSlicePrefix}/`
    : "";

  // Defend against SQL injection — the slice is derived from URL params.
  if (normalizedSlice.includes("'")) {
    return new Response("Invalid slice: contains single quote", { status: 400 });
  }

  const indexKey = toIndexS3Key(connectionPrefix);
  const id = randomUUID();
  const oldParquetPath = join(tmpdir(), `cytario-${id}-old.parquet`);
  const newParquetPath = join(tmpdir(), `cytario-${id}-new.parquet`);
  const jsonPath = join(tmpdir(), `cytario-${id}.json`);

  for (const p of [oldParquetPath, newParquetPath, jsonPath]) {
    if (p.includes("'")) {
      throw new Error("Temp file path contains single quote");
    }
  }

  try {
    const s3Client = await getS3Client(connectionConfig, credentials, user.sub);

    // 1. Download current parquet.
    const existing = await s3Client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: indexKey }),
    );
    const bodyBytes = await existing.Body?.transformToByteArray();
    if (!bodyBytes) {
      return new Response("Existing index body is empty", { status: 500 });
    }
    await writeFile(oldParquetPath, Buffer.from(bodyBytes));

    // 2. Fetch the live slice (depth-1 children only).
    const listResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: normalizedSlice || undefined,
        Delimiter: "/",
      }),
    );
    const seen = new Set<string>();
    const liveRows = (listResponse.Contents ?? [])
      .filter((obj) => connectionIndexFilter(obj, seen))
      .map((obj) => ({
        key: obj.Key ?? "",
        size: obj.Size ?? 0,
        last_modified: obj.LastModified?.toISOString() ?? null,
        etag: (obj.ETag ?? "").replace(/"/g, ""),
      }));

    // 3. Rebuild the parquet: existing minus old slice, plus fresh slice.
    const instance = await DuckDBInstance.create();
    const connection = await instance.connect();

    await connection.run(
      /* sql */ `CREATE TABLE objects AS SELECT * FROM read_parquet('${oldParquetPath}')`,
    );

    // Remove immediate children of the slice (not recursive — subdirs stay).
    // `position(...) = 0` means "no '/' in the remainder", i.e. depth-1.
    // The trailing-slash check covers directory-marker objects.
    await connection.run(/* sql */ `
      DELETE FROM objects
      WHERE key LIKE '${normalizedSlice}%'
        AND (
          position('/' IN substr(key, ${normalizedSlice.length + 1})) = 0
          OR substr(key, ${normalizedSlice.length + 1}) LIKE '%/'
        )
    `);

    if (liveRows.length > 0) {
      await writeFile(jsonPath, JSON.stringify(liveRows));
      await connection.run(
        /* sql */ `INSERT INTO objects SELECT * FROM read_json_auto('${jsonPath}')`,
      );
    }

    const countResult = await connection.run(
      /* sql */ "SELECT COUNT(*)::INTEGER AS c FROM objects",
    );
    const rows = await countResult.getRowObjects();
    const objectCount = Number(rows[0]?.c ?? 0);

    await connection.run(
      /* sql */ `COPY (SELECT * FROM objects ORDER BY key) TO '${newParquetPath}' (FORMAT PARQUET, COMPRESSION ZSTD)`,
    );

    // 4. Upload new parquet.
    const newParquet = await readFile(newParquetPath);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: indexKey,
        Body: newParquet,
        ContentType: "application/octet-stream",
        Metadata: {
          "object-count": String(objectCount),
        },
      }),
    );

    console.info(
      `[connectionIndex] Updated slice "${slice}" for ${provider}/${bucketName}: now ${objectCount} objects`,
    );

    return Response.json({
      objectCount,
      builtAt: new Date().toISOString(),
      patched: true,
    });
  } catch (error) {
    console.error(
      `[connectionIndex] Update failed for ${provider}/${bucketName}:`,
      error,
    );
    return new Response("Indexing failed", { status: 500 });
  } finally {
    await Promise.all([
      unlink(oldParquetPath).catch(() => {}),
      unlink(newParquetPath).catch(() => {}),
      unlink(jsonPath).catch(() => {}),
    ]);
  }
};
