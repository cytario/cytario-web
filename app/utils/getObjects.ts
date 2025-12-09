import { _Object, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { BucketConfig } from "@prisma/client";

import { filterObjects } from "./filterObjects";
import { TreeNode } from "../components/DirectoryView/buildDirectoryTree";

export interface GetFilesResponse {
  searchQuery: string | null;
  filesCount: number;
  items: TreeNode;
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

  const filteredFiles = filterObjects(Contents, { query });

  return filteredFiles;
};
