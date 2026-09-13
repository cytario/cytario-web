import {
  findCoveringColumns,
  interpretOverlaySchema,
  validateOverlayConfig,
} from "../overlayConfig";
import type { ParquetColumn } from "~/components/DataGrid/getParquetSchema";

const col = (name: string, type: string): ParquetColumn => ({ name, type });

/** Schema shape of a geopandas 1.1 `write_covering=True` export: WKB geometry
 * column, bbox STRUCT covering, no x/y — plus the sample's numeric classes. */
const coveringSchema = (): ParquetColumn[] => [
  col("object", "INT64"),
  col("geometry", "BYTE_ARRAY"),
  col("bbox", "STRUCT(xmin DOUBLE, ymin DOUBLE, xmax DOUBLE, ymax DOUBLE)"),
  col("slide_label", "VARCHAR"),
  col("marker_positive_cd8", "BOOLEAN"),
  col("mean_intensity_nuc_cd8", "DOUBLE"),
];

describe("findCoveringColumns", () => {
  test("resolves the struct bbox covering to dotted subfield paths", () => {
    const covering = findCoveringColumns(coveringSchema());
    expect(covering).toEqual({
      xmin: "bbox.xmin",
      xmax: "bbox.xmax",
      ymin: "bbox.ymin",
      ymax: "bbox.ymax",
    });
  });

  test("resolves flat numeric covering columns", () => {
    const covering = findCoveringColumns([
      col("x_min", "DOUBLE"),
      col("x_max", "DOUBLE"),
      col("y_min", "DOUBLE"),
      col("y_max", "DOUBLE"),
      col("geometry", "BYTE_ARRAY"),
    ]);
    expect(covering).toEqual({
      xmin: "x_min",
      xmax: "x_max",
      ymin: "y_min",
      ymax: "y_max",
    });
  });

  test("returns null when only some covering columns exist", () => {
    expect(findCoveringColumns([col("xmin", "DOUBLE"), col("xmax", "DOUBLE")])).toBeNull();
  });

  test("ignores a non-struct bbox column", () => {
    expect(findCoveringColumns([col("bbox", "VARCHAR")])).toBeNull();
  });
});

describe("interpretOverlaySchema — geometry-anchored layouts", () => {
  test("anchors on the covering when x/y are absent", () => {
    const config = interpretOverlaySchema(coveringSchema());

    expect(config).not.toBeNull();
    expect(config?.anchor).toEqual({
      encoding: "wkb",
      covering: {
        xmin: "bbox.xmin",
        xmax: "bbox.xmax",
        ymin: "bbox.ymin",
        ymax: "bbox.ymax",
      },
    });
    expect(config?.columns).toEqual({
      id: "object",
      geometry: "geometry",
      x: "",
      y: "",
    });
    expect(config?.classes).toHaveLength(1);
    expect(config?.classes[0]).toMatchObject({
      sourceColumn: "marker_positive_cd8",
      mode: "boolean",
    });
  });

  test("numeric non-marker columns become threshold classes without the marker_positive_ prefix", () => {
    const config = interpretOverlaySchema([
      col("object", "INT64"),
      col("geometry", "BYTE_ARRAY"),
      col("bbox", "STRUCT(xmin DOUBLE, ymin DOUBLE, xmax DOUBLE, ymax DOUBLE)"),
      col("mean_intensity_nuc_cd8", "DOUBLE"),
      col("rescued", "BOOLEAN"),
    ]);

    expect(config?.anchor?.encoding).toBe("wkb");
    expect(config?.classes).toHaveLength(2);
    expect(config?.classes[0]).toMatchObject({
      sourceColumn: "mean_intensity_nuc_cd8",
      mode: "threshold",
    });
    expect(config?.classes[1]).toMatchObject({
      sourceColumn: "rescued",
      mode: "boolean",
    });
  });

  test("derives the WKT encoding for text geometry columns", () => {
    const config = interpretOverlaySchema([
      col("object", "INT64"),
      col("geometry", "VARCHAR"),
      col("bbox", "STRUCT(xmin DOUBLE, ymin DOUBLE, xmax DOUBLE, ymax DOUBLE)"),
      col("marker_positive_cd8", "BOOLEAN"),
    ]);
    expect(config?.anchor?.encoding).toBe("wkt");
  });

  test("returns null without x/y when no covering exists — the geometry column cannot be pruned", () => {
    const config = interpretOverlaySchema([
      col("object", "INT64"),
      col("geometry", "BYTE_ARRAY"),
      col("marker_positive_cd8", "BOOLEAN"),
    ]);
    expect(config).toBeNull();
  });

  test("x/y columns still win over the anchor", () => {
    const config = interpretOverlaySchema([
      col("object", "INT64"),
      col("geometry", "BYTE_ARRAY"),
      col("x", "DOUBLE"),
      col("y", "DOUBLE"),
      col("marker_positive_cd8", "BOOLEAN"),
    ]);
    expect(config?.anchor).toBeUndefined();
    expect(config?.columns.x).toBe("x");
  });

  test("structural columns exclude the covering so it stays out of classes", () => {
    const config = interpretOverlaySchema(coveringSchema());
    expect(config?.classes.map((c) => c.sourceColumn)).not.toContain("bbox");
  });
});

describe("validateOverlayConfig — geometry-anchored configs", () => {
  test("accepts an anchored config with a struct covering", () => {
    const config = interpretOverlaySchema(coveringSchema());
    expect(config).not.toBeNull();
    expect(validateOverlayConfig(config!, coveringSchema())).toBe(true);
  });

  test("accepts an anchored config with flat covering columns", () => {
    const schema = [
      col("object", "INT64"),
      col("geometry", "BYTE_ARRAY"),
      col("x_min", "DOUBLE"),
      col("x_max", "DOUBLE"),
      col("y_min", "DOUBLE"),
      col("y_max", "DOUBLE"),
      col("marker_positive_cd8", "BOOLEAN"),
    ];
    const config = interpretOverlaySchema(schema);
    expect(config).not.toBeNull();
    expect(validateOverlayConfig(config!, schema)).toBe(true);
  });

  test("rejects an anchored config whose covering columns vanished from the schema", () => {
    const config = interpretOverlaySchema(coveringSchema());
    expect(config).not.toBeNull();
    const mutated = coveringSchema().filter((c) => c.name !== "bbox");
    expect(validateOverlayConfig(config!, mutated)).toBe(false);
  });

  test("rejects an anchored config without a geometry column", () => {
    const config = interpretOverlaySchema(coveringSchema());
    expect(config).not.toBeNull();
    const noGeom = coveringSchema().filter((c) => c.name !== "geometry");
    expect(validateOverlayConfig(config!, noGeom)).toBe(false);
  });
});
