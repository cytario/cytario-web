import { type Table } from "apache-arrow";

import { createDatabase } from "./createDatabase";
import { ensureSpatialLoaded } from "./ensureSpatialLoaded";
import { getGeomQuery } from "./getGeomQuery";
import { resolveResourceId } from "../connectionsStore/selectors";

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

export async function getTileDataWasm(
  resourceId: string,
  tileIndex: TileIndex,
  markerColumns: string[] = [],
): Promise<Table | null> {
  try {
    const { credentials, connectionConfig, s3Uri } = resolveResourceId(resourceId);
    const connection = await createDatabase(resourceId, credentials, connectionConfig);
    await ensureSpatialLoaded(connection);
    const tileQuery = getGeomQuery(s3Uri, tileIndex, markerColumns);
    const arrowTable = await connection.query(tileQuery);

    if (arrowTable.numRows === 0) {
      return null;
    }

    // DuckDB-WASM bundles its own apache-arrow; runtime-compatible but
    // structurally different to TypeScript.
    return arrowTable as unknown as Table;
  } catch (error) {
    console.error(`[getTileDataWasm] Error fetching tile data:`, error);
    throw error;
  }
}
