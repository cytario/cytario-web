import { Credentials } from "@aws-sdk/client-sts";
import { type Table } from "apache-arrow";

import { createDatabase } from "./createDatabase";
import { getGeomQuery } from "./getGeomQuery";
import { BucketConfig } from "~/.generated/client";

interface TileIndex {
  z: number;
  x: number;
  y: number;
}
export interface PointRow extends Record<string, unknown> {
  id: string | number;
  x: number;
  y: number;
}

/**
 * Fetch tile data from DuckDB-WASM database on S3
 * @param resourceId - S3 resource identifier (bucketName/pathName)
 * @param tileIndex - Tile index (z, x, y)
 * @param credentials - AWS credentials with access to the S3 bucket
 * @param markerColumns - Optional list of marker columns to include
 * @param bucketConfig - Optional bucket configuration for S3-compatible services
 */
export async function getTileDataWasm(
  resourceId: string,
  tileIndex: TileIndex,
  credentials: Credentials,
  markerColumns: string[] = [],
  bucketConfig?: BucketConfig | null,
): Promise<Table | null> {
  try {
    const connection = await createDatabase(
      resourceId,
      credentials,
      bucketConfig,
    );
    const tileQuery = getGeomQuery(resourceId, tileIndex, markerColumns);
    const arrowTable = await connection.query(tileQuery);

    if (arrowTable.numRows === 0) {
      return null;
    }

    // Type assertion needed: DuckDB-WASM bundles its own apache-arrow version
    // which is compatible at runtime but TypeScript sees them as different types
    return arrowTable as unknown as Table;
  } catch (error) {
    console.error(`[getTileDataWasm] Error fetching tile data:`, error);
    throw error;
  }
}
