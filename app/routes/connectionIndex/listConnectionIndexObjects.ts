import { type _Object, ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";

import { createConnectionIndexFilter } from "./connectionIndexFilter";

interface Args {
  s3Client: S3Client;
  Bucket: string;
  Prefix: string;
  /** Pass `"/"` for a depth-1 slice (single page); omit for a recursive walk. */
  Delimiter?: string;
  /** Cap on `Contents` accumulated across pages. Ignored when `Delimiter` is set. */
  maxObjects?: number;
}

interface Result {
  /** Filtered through `createConnectionIndexFilter` (zarr-chunk dedup, hidden files kept). */
  Contents: _Object[];
  /** Raw common prefixes (subdirectory markers) — populated only when `Delimiter` is set. */
  CommonPrefixes: string[];
}

/**
 * Single entry point for every `ListObjectsV2` call the index uses. Handles
 * pagination for recursive walks and applies the connection-index filter so
 * callers don't have to thread state.
 */
export async function listConnectionIndexObjects({
  s3Client,
  Bucket,
  Prefix,
  Delimiter,
  maxObjects = 500_000,
}: Args): Promise<Result> {
  const filter = createConnectionIndexFilter();
  const Contents: _Object[] = [];
  const CommonPrefixes: string[] = [];
  let ContinuationToken: string | undefined;

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({ Bucket, Prefix, Delimiter, ContinuationToken }),
    );

    for (const obj of response.Contents ?? []) {
      if (filter(obj)) Contents.push(obj);
    }
    for (const cp of response.CommonPrefixes ?? []) {
      if (cp.Prefix) CommonPrefixes.push(cp.Prefix);
    }

    if (Contents.length >= maxObjects) {
      console.warn(
        `[listConnectionIndexObjects] Hit max object limit (${maxObjects}) for ${Bucket}/${Prefix}`,
      );
      break;
    }

    ContinuationToken = response.NextContinuationToken;
  } while (ContinuationToken);

  return { Contents, CommonPrefixes };
}
