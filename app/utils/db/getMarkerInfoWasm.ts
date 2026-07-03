import { createDatabase } from "./createDatabase";
import { resolveResourceId } from "../connectionsStore/selectors";
import { MarkerInfo } from "~/components/.client/ImageViewer/components/OverlaysPanel/getOverlayState";

/** Total cell/object count (row count) of an overlay parquet. */
export async function getOverlayCellCount(resourceId: string): Promise<number> {
  const { credentials, connectionConfig, s3Uri } = resolveResourceId(resourceId);
  const connection = await createDatabase(resourceId, credentials, connectionConfig);
  const result = await connection.query(/*sql*/ `
    SELECT count(*)::BIGINT AS n FROM read_parquet('${s3Uri}')
  `);
  const row = result.toArray()[0] as { n: bigint } | undefined;
  return Number(row?.n ?? 0);
}

/**
 * Extract marker information from DuckDB-WASM database.
 */
export async function getMarkerInfoWasm(resourceId: string): Promise<MarkerInfo> {
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
