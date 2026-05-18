import { escapeSqlString } from "./escapeSqlString";

export function buildCreateTableQuery(id: string, geometryColumn: string = "polygon"): string {
  // S3 keys may contain `'`. `geometryColumn` is an unquoted identifier — callers
  // must keep it to known-safe values.
  const escapedId = escapeSqlString(id);
  return /*sql*/ `
    CREATE TABLE IF NOT EXISTS geometries AS
    SELECT
      *,
      ST_GeomFromText(${geometryColumn}) AS geom,
      -- Don't use centroid for indexing as it is expensive to compute
      ST_XMin(geom) as x,
      ST_YMin(geom) as y
      -- ST_X(ST_Centroid(geom)) AS x,
      -- ST_Y(ST_Centroid(geom)) AS y
    FROM read_csv_auto('${escapedId}', HEADER=TRUE, comment='#');
  `;
}

export const geomIndexQuery = /*sql*/ `CREATE INDEX idx_geometries_geom ON geometries USING RTREE (geom);`;
