import { getGeomQuery } from "../getGeomQuery";

describe("getQuery", () => {
  const tileIndex = { z: 0, x: 0, y: 0 };
  // Use proper resourceId format: provider/bucketName/pathName
  const resourceId = "aws/test-bucket/data/results.parquet";

  test("returns polygon query with WKB geometry for z >= -3", () => {
    const markerColumns = ["marker_positive_pd-1", "marker_positive_cd4"];
    const sql = getGeomQuery(resourceId, tileIndex, markerColumns);
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
    const sql = getGeomQuery(resourceId, { z: -5, x: 0, y: 0 }, markerColumns);
    // At z=-5, this is point mode (not aggregated since isAggregatedMode is disabled)
    expect(sql).toContain("object as id");
    expect(sql).toContain("x");
    expect(sql).toContain("y");
    expect(sql).toContain("marker_bitmask");
    expect(sql).not.toContain("BIT_OR"); // Not using aggregation
    expect(sql).not.toContain("ST_AsWKB");
    expect(sql).not.toContain("geom");
  });

  test("uses x/y based filtering instead of ST_Contains", () => {
    const sql = getGeomQuery(resourceId, tileIndex);
    expect(sql).not.toContain("ST_Contains");
    expect(sql).toContain("x BETWEEN");
    expect(sql).toContain("y BETWEEN");
  });

  test("calculates correct bounds for tile coordinates", () => {
    const sql = getGeomQuery(resourceId, { z: 1, x: 2, y: 3 });
    // At z=1, tile size is 256, so:
    // minX = 2 * 256 = 512
    // maxX = 512 + 256 = 768
    // minY = 3 * 256 = 768
    // maxY = 768 + 256 = 1024
    expect(sql).toContain("x BETWEEN 512 AND 768");
    expect(sql).toContain("y BETWEEN 768 AND 1024");
  });

  test("generates correct S3 URI without provider prefix", () => {
    const sql = getGeomQuery(resourceId, tileIndex);
    // Should contain s3://bucket/path, NOT s3://provider/bucket/path
    expect(sql).toContain("s3://test-bucket/data/results.parquet");
    expect(sql).not.toContain("s3://aws/");
  });

  test("handles different providers in resourceId", () => {
    const minioResourceId = "minio/my-bucket/folder/file.parquet";
    const sql = getGeomQuery(minioResourceId, tileIndex);
    expect(sql).toContain("s3://my-bucket/folder/file.parquet");
    expect(sql).not.toContain("s3://minio/");
  });
});
