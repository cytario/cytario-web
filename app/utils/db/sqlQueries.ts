export function buildCreateTableQuery(
  id: string,
  geometryColumn: string = "polygon"
): string {
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
    FROM read_csv_auto('${id}', HEADER=TRUE, comment='#');
  `;
}

export const geomIndexQuery = /*sql*/ `CREATE INDEX idx_geometries_geom ON geometries USING RTREE (geom);`;
