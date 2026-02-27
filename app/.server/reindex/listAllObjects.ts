import { _Object, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

/**
 * Paginated ListObjectsV2 that fetches all objects under a prefix.
 * When prefix is empty, fetches the entire bucket.
 */
export async function listAllObjects(
  s3Client: S3Client,
  bucketName: string,
  prefix = "",
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

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}
