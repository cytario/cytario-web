import { _Object, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

import { filterObjects } from "./filterObjects";
import { BucketConfig } from "~/.generated/client";

/**
 * Check if an S3 object is a directory marker (empty object ending with /)
 */
function isDirectoryMarker(obj: _Object): boolean {
  return Boolean(obj.Key?.endsWith("/") && obj.Size === 0);
}

export const getObjects = async (
  bucketConfig: BucketConfig,
  s3Client: S3Client,
  query?: string | null,
  prefix?: string
): Promise<_Object[]> => {
  const listObjectsCommand = new ListObjectsV2Command({
    Bucket: bucketConfig.name,
    Prefix: prefix,
  });

  const { Contents } = await s3Client.send(listObjectsCommand);

  // Filter out directory markers before any other filtering
  const files = Contents?.filter((obj) => !isDirectoryMarker(obj));

  const filteredFiles = filterObjects(files, { query });

  return filteredFiles;
};
