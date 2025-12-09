import { Credentials } from "@aws-sdk/client-sts";

import { getFileType, getReadFunction } from "./fileReader";
import { ClientBucketConfig } from "../../utils/credentialsStore/useCredentialsStore";
import { createDatabase } from "../../utils/db/createDatabase";
import { toS3Uri } from "../../utils/resourceId";

export interface ParquetColumn {
  name: string;
  type: string;
}

/**
 * Fetch the schema (column names and types) from a data file on S3
 * Supports: parquet, csv, json
 * @param resourceId Resource identifier (provider/bucketName/pathName)
 * @param credentials AWS credentials with access to the S3 bucket
 * @param bucketConfig Optional bucket configuration for S3-compatible services
 */
export async function getParquetSchema(
  resourceId: string,
  credentials: Credentials,
  bucketConfig?: ClientBucketConfig | null
): Promise<ParquetColumn[]> {
  const connection = await createDatabase(resourceId, credentials, bucketConfig);
  const fileType = getFileType(resourceId);
  const s3Path = toS3Uri(resourceId);

  let result;

  if (fileType === "parquet") {
    // Parquet has dedicated schema function
    result = await connection.query(/*sql*/ `
      SELECT name, type
      FROM parquet_schema('${s3Path}')
      WHERE type IS NOT NULL
    `);
  } else {
    // CSV/JSON: use DESCRIBE on the read function
    const readFn = getReadFunction(fileType, s3Path);
    result = await connection.query(/*sql*/ `
      DESCRIBE SELECT * FROM ${readFn}
    `);
  }

  const columns: ParquetColumn[] = [];
  for (let i = 0; i < result.numRows; i++) {
    const row = result.get(i);
    if (row) {
      // DESCRIBE returns column_name and column_type
      const name = (row.name ?? row.column_name) as string;
      const type = (row.type ?? row.column_type) as string;
      columns.push({ name, type });
    }
  }

  return columns;
}
