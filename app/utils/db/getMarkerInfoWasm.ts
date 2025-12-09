import { Credentials } from "@aws-sdk/client-sts";

import { createDatabase } from "./createDatabase";
import { ClientBucketConfig } from "../credentialsStore/useCredentialsStore";
import { toS3Uri } from "../resourceId";
import { MarkerInfo } from "~/components/.client/ImageViewer/components/OverlaysController/getOverlayState";

/**
 * Extract marker information from DuckDB-WASM database.
 * @param resourceId - S3 resource identifier (bucketName/pathName)
 * @param credentials - AWS credentials with access to the S3 bucket
 * @param bucketConfig - Optional bucket configuration for S3-compatible services
 */
export async function getMarkerInfoWasm(
  resourceId: string,
  credentials: Credentials,
  bucketConfig?: ClientBucketConfig | null
): Promise<MarkerInfo> {
  const connection = await createDatabase(resourceId, credentials, bucketConfig);

  try {
    const parquetPath = toS3Uri(resourceId);

    // Select and sum all marker columns
    const countResult = await connection.query(/*sql*/ `
      SELECT SUM(COLUMNS('marker_positive_.*'))
      FROM read_parquet('${parquetPath}')
    `);

    const row = countResult.toArray()[0] as Record<string, bigint>;
    const markerInfo: Record<string, { count: number }> = {};

    // Column names are preserved in the result
    for (const [column, value] of Object.entries(row)) {
      markerInfo[column] = { count: Number(value || 0) };
    }

    return markerInfo;
  } catch (error) {
    console.error(`Error extracting marker info:`, error);
    throw error;
  }
}
