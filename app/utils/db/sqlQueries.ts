import { escapeSqlIdentifier } from "./escapeSqlIdentifier";
import { escapeSqlString } from "./escapeSqlString";
import { type OverlayClassConfig, type OverlayColumnsConfig } from "./overlayConfig";

export function buildCreateTableQuery(id: string, geometryColumn: string = "polygon"): string {
  // S3 keys may contain `'`.
  const escapedId = escapeSqlString(id);
  const escapedGeometryColumn = escapeSqlIdentifier(geometryColumn);
  return /*sql*/ `
    CREATE TABLE IF NOT EXISTS geometries AS
    SELECT
      *,
      ST_GeomFromText(${escapedGeometryColumn}) AS geom,
      -- Don't use centroid for indexing as it is expensive to compute
      ST_XMin(geom) as x,
      ST_YMin(geom) as y
      -- ST_X(ST_Centroid(geom)) AS x,
      -- ST_Y(ST_Centroid(geom)) AS y
    FROM read_csv_auto('${escapedId}', HEADER=TRUE, comment='#');
  `;
}

export const geomIndexQuery = /*sql*/ `CREATE INDEX idx_geometries_geom ON geometries USING RTREE (geom);`;

/**
 * COPY projection for CSV→Parquet conversion: geometry as WKT (serializes
 * better than WKB in parquet), the mapped id/x/y columns, and every class
 * source column under its original name.
 */
export function buildOverlayCopyProjection(
  columns: OverlayColumnsConfig,
  classes: OverlayClassConfig[],
): string {
  const id = escapeSqlIdentifier(columns.id);
  const x = escapeSqlIdentifier(columns.x);
  const y = escapeSqlIdentifier(columns.y);
  const geom = escapeSqlIdentifier(columns.geometry);
  const classColumns = classes
    .map((cls) => escapeSqlIdentifier(cls.sourceColumn))
    .join(",\n          ");
  return [`${id} as object`, `${x} as x`, `${y} as y`, `ST_AsText(${geom}) as geom`, classColumns]
    .filter(Boolean)
    .join(",\n          ");
}
