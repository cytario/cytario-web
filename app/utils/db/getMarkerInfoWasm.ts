import { createDatabase } from "./createDatabase";
import { resolveResourceId } from "../connectionsStore";
import { MarkerInfo } from "~/components/.client/ImageViewer/components/OverlaysController/getOverlayState";

/**
 * Extract marker information from DuckDB-WASM database.
 */
export async function getMarkerInfoWasm(
  resourceId: string,
): Promise<MarkerInfo> {
  const { credentials, connectionConfig, s3Uri } = resolveResourceId(resourceId);
  const connection = await createDatabase(resourceId, credentials, connectionConfig);

  try {
    const countResult = await connection.query(/*sql*/ `
      SELECT SUM(COLUMNS('marker_positive_.*'))
      FROM read_parquet('${s3Uri}')
    `);

    const row = countResult.toArray()[0] as Record<string, bigint>;
    const markerInfo: Record<string, { count: number }> = {};

    for (const [column, value] of Object.entries(row)) {
      markerInfo[column] = { count: Number(value || 0) };
    }

    return markerInfo;
  } catch (error) {
    console.error(`Error extracting marker info:`, error);
    throw error;
  }
}
