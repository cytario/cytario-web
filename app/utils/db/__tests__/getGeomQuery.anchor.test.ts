import { getGeomQuery } from "../getGeomQuery";
import type { OverlayClassConfig, OverlayGeometryAnchor } from "../overlayConfig";

const coveringClass = (sourceColumn: string): OverlayClassConfig => ({
  sourceColumn,
  label: sourceColumn,
  mode: "boolean",
});

describe("getGeomQuery with a geometry anchor", () => {
  const s3Uri = "s3://test-bucket/data/covering.parquet";
  const tileIndex = { z: 0, x: 0, y: 0 };

  const structAnchor: OverlayGeometryAnchor = {
    encoding: "wkb",
    covering: { xmin: "bbox.xmin", xmax: "bbox.xmax", ymin: "bbox.ymin", ymax: "bbox.ymax" },
  };
  const flatAnchor: OverlayGeometryAnchor = {
    encoding: "wkb",
    covering: { xmin: "x_min", xmax: "x_max", ymin: "y_min", ymax: "y_max" },
  };

  test("filters tiles on the covering columns and synthesizes x/y from the geometry", () => {
    const sql = getGeomQuery(s3Uri, tileIndex, [], {
      columns: { id: "object", geometry: "geometry", x: "", y: "" },
      anchor: structAnchor,
      classes: [coveringClass("marker_positive_cd8")],
    });

    expect(sql).toContain(`"bbox"."xmax" >= 0`);
    expect(sql).toContain(`"bbox"."xmin" <= 512`);
    expect(sql).toContain(`"bbox"."ymax" >= 0`);
    expect(sql).toContain(`"bbox"."ymin" <= 512`);
    expect(sql).toContain(`ST_X(ST_Centroid(ST_GeomFromWKB("geometry"))) as x`);
    expect(sql).toContain(`ST_Y(ST_Centroid(ST_GeomFromWKB("geometry"))) as y`);
    expect(sql).toContain(`ST_AsWKB(ST_GeomFromWKB("geometry")) as geom`);
    expect(sql).toContain(`"object" as id`);
    expect(sql).not.toContain(`BETWEEN`);
  });

  test("parses WKT-encoded geometry columns via ST_GeomFromText", () => {
    const sql = getGeomQuery(s3Uri, tileIndex, [], {
      columns: { id: "object", geometry: "geom", x: "", y: "" },
      anchor: { ...flatAnchor, encoding: "wkt" },
      classes: [coveringClass("is_tumor")],
    });

    expect(sql).toContain(`ST_GeomFromText("geom")`);
    expect(sql).toContain(`ST_AsWKB(ST_GeomFromText("geom")) as geom`);
  });

  test("flat covering columns filter on plain quoted names", () => {
    const sql = getGeomQuery(s3Uri, tileIndex, [], {
      columns: { id: "object", geometry: "geometry", x: "", y: "" },
      anchor: flatAnchor,
      classes: [coveringClass("is_tumor")],
    });

    expect(sql).toContain(`"x_max" >= 0`);
    expect(sql).toContain(`"x_min" <= 512`);
    expect(sql).toContain(`"y_max" >= 0`);
    expect(sql).toContain(`"y_min" <= 512`);
  });

  test("point mode synthesizes positions without the geometry projection", () => {
    const sql = getGeomQuery(s3Uri, { z: -3, x: 0, y: 0 }, [], {
      columns: { id: "object", geometry: "geometry", x: "", y: "" },
      anchor: structAnchor,
      classes: [coveringClass("is_tumor")],
    });

    expect(sql).toContain(`ST_X(ST_Centroid(ST_GeomFromWKB("geometry"))) as x`);
    expect(sql).not.toContain(`as geom`);
  });

  test("ignores the anchor when x/y columns are present", () => {
    const sql = getGeomQuery(s3Uri, tileIndex, [], {
      columns: { id: "object", geometry: "geometry", x: "x", y: "y" },
      anchor: structAnchor,
      classes: [coveringClass("is_tumor")],
    });

    expect(sql).toContain(`"x" as x`);
    expect(sql).toContain(`"x" BETWEEN 0 AND 512`);
    expect(sql).not.toContain(`ST_Centroid`);
  });
});
