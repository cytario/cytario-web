import { type TileIndex } from "node_modules/@deck.gl/geo-layers/dist/tileset-2d/types";

import { getTileBoundingBox } from "./getTileBoundingBox";
import { toS3Uri } from "../resourceId";

export const isPointMode = (z: number): boolean => z < -2;

/**
 * Build SQL expression for computing marker bitmask
 * Takes all marker columns and generates: (CAST(CAST("col1" AS BOOLEAN) AS INTEGER) << 0 | ...)
 * Column names are quoted to handle special characters (e.g., "marker_positive_pd-1")
 * Double cast ensures values are 0 or 1: first cast to BOOLEAN, then to INTEGER
 */
function buildBitmaskExpression(markerColumns: string[]): string {
  if (markerColumns.length === 0) return "0";

  // Limit to first 32 markers (32-bit integer capacity)
  const limitedMarkers = markerColumns.slice(0, 32);

  const expressions = limitedMarkers.map(
    (col, idx) => `(CAST(CAST("${col}" AS BOOLEAN) AS INTEGER) << ${idx})`
  );

  return `(${expressions.join(" | ")})`;
}

/**
 * Get geometries query based on zoom level
 * @param resourceId - Resource identifier (provider/bucketName/pathName)
 * @param markerColumns - ALL marker column names from the dataset (not just enabled ones)
 */
export function getGeomQuery(
  resourceId: string,
  tileIndex: TileIndex,
  markerColumns: string[] = []
): string {
  const [minX, minY, maxX, maxY] = getTileBoundingBox(tileIndex);
  const bitmaskExpression = buildBitmaskExpression(markerColumns);

  const getPoints = (resourceId: string) => {
    const s3Uri = toS3Uri(resourceId);
    return /*sql*/ `
      SELECT
        object as id,
        x,
        y,
        ${bitmaskExpression} AS marker_bitmask
      FROM read_parquet('${s3Uri}')
      WHERE x BETWEEN ${minX} AND ${maxX}
        AND y BETWEEN ${minY} AND ${maxY}
    `;
  };

  const getPolygons = (resourceId: string) => {
    const s3Uri = toS3Uri(resourceId);
    return /*sql*/ `
      SELECT
        object as id,
        ST_AsWKB(ST_GeomFromText(geom)) as geom, -- Convert WKT → GEOMETRY → WKB binary
        x,
        y,
        ${bitmaskExpression} AS marker_bitmask
      FROM read_parquet('${s3Uri}')
      WHERE x BETWEEN ${minX} AND ${maxX}
        AND y BETWEEN ${minY} AND ${maxY}
    `;
  };

  if (isPointMode(tileIndex.z)) {
    return getPoints(resourceId);
  }

  return getPolygons(resourceId);
}
