import { getGeomQuery } from "../getGeomQuery";

describe("getGeomQuery", () => {
  const tileIndex = { z: 0, x: 0, y: 0 };
  const s3Uri = "s3://test-bucket/data/results.parquet";

  test("returns polygon query with WKB geometry for z >= -3", () => {
    const markerColumns = ["marker_positive_pd-1", "marker_positive_cd4"];
    const sql = getGeomQuery(s3Uri, tileIndex, markerColumns);
    expect(sql).toContain("object as id");
    expect(sql).toContain("ST_AsWKB(ST_GeomFromText(geom)) as geom");
    expect(sql).toContain("x");
    expect(sql).toContain("y");
    expect(sql).toContain("marker_bitmask");
    expect(sql).toContain("x BETWEEN 0 AND 512");
    expect(sql).toContain("y BETWEEN 0 AND 512");
    expect(sql).not.toContain("ST_Simplify");
  });

  test("returns point query for z < -2", () => {
    const markerColumns = ["marker_positive_pd-1", "marker_positive_cd4"];
    const sql = getGeomQuery(s3Uri, { z: -5, x: 0, y: 0 }, markerColumns);
    expect(sql).toContain("object as id");
    expect(sql).toContain("x");
    expect(sql).toContain("y");
    expect(sql).toContain("marker_bitmask");
    expect(sql).not.toContain("BIT_OR");
    expect(sql).not.toContain("ST_AsWKB");
    expect(sql).not.toContain("geom");
  });

  test("uses x/y based filtering instead of ST_Contains", () => {
    const sql = getGeomQuery(s3Uri, tileIndex);
    expect(sql).not.toContain("ST_Contains");
    expect(sql).toContain("x BETWEEN");
    expect(sql).toContain("y BETWEEN");
  });

  test("calculates correct bounds for tile coordinates", () => {
    const sql = getGeomQuery(s3Uri, { z: 1, x: 2, y: 3 });
    expect(sql).toContain("x BETWEEN 512 AND 768");
    expect(sql).toContain("y BETWEEN 768 AND 1024");
  });

  test("embeds the S3 URI in the query", () => {
    const sql = getGeomQuery(s3Uri, tileIndex);
    expect(sql).toContain("read_parquet('s3://test-bucket/data/results.parquet')");
  });
});
