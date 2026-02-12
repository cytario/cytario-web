import { Credentials } from "@aws-sdk/client-sts";

import { getFileType, getReadFunction } from "./fileReader";
import { createDatabase } from "../../utils/db/createDatabase";
import { toS3Uri } from "../../utils/resourceId";
import { BucketConfig } from "~/.generated/client";

/**
 * Fetch rows from a data file on S3
 * Supports: parquet, csv, json
 * @param resourceId Resource identifier (provider/bucketName/pathName)
 * @param credentials AWS credentials with access to the S3 bucket
 * @param limit Maximum number of rows to fetch (default: 100)
 * @param offset Number of rows to skip (default: 0)
 * @param bucketConfig Optional bucket configuration for S3-compatible services
 */
export async function getParquetRows(
  resourceId: string,
  credentials: Credentials,
  limit = 100,
  offset = 0,
  bucketConfig?: BucketConfig | null,
): Promise<Record<string, unknown>[]> {
  const connection = await createDatabase(
    resourceId,
    credentials,
    bucketConfig,
  );
  const fileType = getFileType(resourceId);
  const s3Path = toS3Uri(resourceId);
  const readFn = getReadFunction(fileType, s3Path);

  const result = await connection.query(/*sql*/ `
    SELECT * FROM ${readFn}
    LIMIT ${limit} OFFSET ${offset}
  `);

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < result.numRows; i++) {
    const row = result.get(i);
    if (row) {
      rows.push(row.toJSON());
    }
  }

  return rows;
}
