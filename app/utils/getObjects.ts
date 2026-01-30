import { _Object, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

import { filterObjects } from "./filterObjects";
import { BucketConfig } from "~/.generated/client";

export const getObjects = async (
  bucketConfig: BucketConfig,
  s3Client: S3Client,
  query?: string | null,
  prefix?: string,
): Promise<_Object[]> => {
  const listObjectsCommand = new ListObjectsV2Command({
    Bucket: bucketConfig.name,
    Prefix: prefix,
  });

  const { Contents } = await s3Client.send(listObjectsCommand);

  const filteredFiles = filterObjects(Contents, { query });

  return filteredFiles;
};
