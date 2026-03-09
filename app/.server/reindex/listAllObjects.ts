import { _Object, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

/**
 * Paginated ListObjectsV2 that fetches all objects under a prefix.
 * When prefix is empty, fetches the entire bucket.
 *
 * Uses a configurable maxObjects limit to prevent unbounded memory usage
 * on buckets with millions of objects.
 */
export async function listAllObjects(
  s3Client: S3Client,
  bucketName: string,
  prefix = "",
  maxObjects = 500_000,
): Promise<_Object[]> {
  const objects: _Object[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix || undefined,
        ContinuationToken: continuationToken,
      }),
    );

    if (response.Contents) {
      objects.push(...response.Contents);
    }

    if (objects.length >= maxObjects) {
      console.warn(
        `[listAllObjects] Hit max object limit (${maxObjects}) for ${bucketName}/${prefix}`,
      );
      break;
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}
