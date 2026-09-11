import type { _TileLoadProps } from "@deck.gl/geo-layers";

import { escapeSqlIdentifier } from "./escapeSqlIdentifier";
import { getTileBoundingBox } from "./getTileBoundingBox";
import {
  type OverlayClassConfig,
  type OverlayColumnsConfig,
  OVERLAY_CLASS_BIT_LIMIT,
} from "./overlayConfig";

/** TileIndex isn't re-exported from the package entry — derive it from the public props type. */
type TileIndex = _TileLoadProps["index"];

export const isPointMode = (z: number): boolean => z < -2;

function classBitExpression(cls: OverlayClassConfig, bitIndex: number): string {
  const source = escapeSqlIdentifier(cls.sourceColumn);
  const bit =
    cls.mode === "threshold"
      ? `(${source} ${cls.operator} ${cls.threshold})`
      : `CAST(${source} AS BOOLEAN)`;
  return `(CAST(${bit} AS INTEGER) << ${bitIndex})`;
}

/**
 * Build SQL expression for computing marker bitmask.
 * Takes all marker classes and generates: (CAST(CAST("col1" AS BOOLEAN) AS INTEGER) << 0 | ...)
 * Column names are quoted to handle special characters (e.g., "marker_positive_pd-1")
 * The boolean→integer cast ensures each bit is 0 or 1.
 */
function buildBitmaskExpression(markerColumns: string[]): string {
  if (markerColumns.length === 0) return "0";

  // Limit to first 32 markers (32-bit integer capacity)
  const limitedMarkers = markerColumns.slice(0, OVERLAY_CLASS_BIT_LIMIT);

  const expressions = limitedMarkers.map(
    (col, idx) => `(CAST(CAST("${col}" AS BOOLEAN) AS INTEGER) << ${idx})`,
  );

  return `(${expressions.join(" | ")})`;
}

function buildBitmaskExpressionFromClasses(classes: OverlayClassConfig[]): string {
  if (classes.length === 0) return "0";
  const limited = classes.slice(0, OVERLAY_CLASS_BIT_LIMIT);
  return `(${limited.map((cls, idx) => classBitExpression(cls, idx)).join(" | ")})`;
}

function selectColumns(columns: OverlayColumnsConfig): {
  id: string;
  geom?: string;
  x: string;
  y: string;
} {
  return {
    id: escapeSqlIdentifier(columns.id),
    geom: columns.geometry ? escapeSqlIdentifier(columns.geometry) : undefined,
    x: escapeSqlIdentifier(columns.x),
    y: escapeSqlIdentifier(columns.y),
  };
}

/**
 * Get geometries query based on zoom level.
 * @param s3Uri - S3 URI for the parquet file (s3://bucketName/pathName)
 * @param markerColumns - ALL marker column names from the dataset (not just enabled ones)
 * @param config - overlay column mapping; marker columns come from its classes
 */
export function getGeomQuery(
  s3Uri: string,
  tileIndex: TileIndex,
  markerColumns: string[] = [],
  config?: { columns: OverlayColumnsConfig; classes: OverlayClassConfig[] } | null,
): string {
  const [minX, minY, maxX, maxY] = getTileBoundingBox(tileIndex);

  if (config) {
    const bitmaskExpression = buildBitmaskExpressionFromClasses(config.classes);
    const { id, geom, x, y } = selectColumns(config.columns);

    if (isPointMode(tileIndex.z)) {
      return /*sql*/ `
        SELECT
          ${id} as id,
          ${x} as x,
          ${y} as y,
          ${bitmaskExpression} AS marker_bitmask
        FROM read_parquet('${s3Uri}')
        WHERE ${x} BETWEEN ${minX} AND ${maxX}
          AND ${y} BETWEEN ${minY} AND ${maxY}
      `;
    }

    return /*sql*/ `
      SELECT
        ${id} as id,
        ST_AsWKB(ST_GeomFromText(${geom})) as geom, -- Convert WKT → GEOMETRY → WKB binary
        ${x} as x,
        ${y} as y,
        ${bitmaskExpression} AS marker_bitmask
      FROM read_parquet('${s3Uri}')
      WHERE ${x} BETWEEN ${minX} AND ${maxX}
        AND ${y} BETWEEN ${minY} AND ${maxY}
    `;
  }

  const bitmaskExpression = buildBitmaskExpression(markerColumns);

  if (isPointMode(tileIndex.z)) {
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
  }

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
}
