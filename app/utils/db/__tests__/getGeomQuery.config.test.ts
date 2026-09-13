import { getGeomQuery } from "../getGeomQuery";
import type { OverlayClassConfig, OverlayColumnsConfig } from "../overlayConfig";

const columns = (overrides: Partial<OverlayColumnsConfig> = {}): OverlayColumnsConfig => ({
  id: "object",
  geometry: "geom",
  x: "x",
  y: "y",
  ...overrides,
});

const booleanClass = (sourceColumn: string): OverlayClassConfig => ({
  sourceColumn,
  label: sourceColumn,
  mode: "boolean",
});

const thresholdClass = (
  sourceColumn: string,
  operator: OverlayClassConfig["operator"],
  threshold: number,
): OverlayClassConfig => ({
  sourceColumn,
  label: sourceColumn,
  mode: "threshold",
  operator,
  threshold,
});

describe("getGeomQuery with config", () => {
  const tileIndex = { z: 0, x: 0, y: 0 };
  const s3Uri = "s3://test-bucket/data/results.parquet";

  test("renders boolean bits from configured class columns", () => {
    const sql = getGeomQuery(s3Uri, tileIndex, [], {
      columns: columns(),
      classes: [booleanClass("is_tumor"), booleanClass("we'ird col")],
    });

    expect(sql).toContain(`(CAST(CAST("is_tumor" AS BOOLEAN) AS INTEGER) << 0)`);
    expect(sql).toContain(`"we'ird col"`);
    expect(sql).toContain(`"object" as id`);
    expect(sql).toContain(`ST_AsWKB(ST_GeomFromText("geom")) as geom`);
    expect(sql).toContain(`"x" as x`);
    expect(sql).toContain(`"y" as y`);
  });

  test("renders threshold bits with the comparison expression", () => {
    const sql = getGeomQuery(s3Uri, tileIndex, [], {
      columns: columns(),
      classes: [thresholdClass("cd8_intensity", ">", 3.5)],
    });

    expect(sql).toContain(`(CAST(("cd8_intensity" > 3.5) AS INTEGER) << 0)`);
  });

  test.each([">", ">=", "<", "<=", "=", "!="] as const)(
    "supports the %s operator in threshold mode",
    (operator) => {
      const sql = getGeomQuery(s3Uri, tileIndex, [], {
        columns: columns(),
        classes: [thresholdClass("intensity", operator, 10)],
      });
      expect(sql).toContain(`("intensity" ${operator} 10)`);
    },
  );

  test("maps custom geometry, id, and coordinate columns", () => {
    const sql = getGeomQuery(s3Uri, tileIndex, [], {
      columns: columns({ id: "cell_id", geometry: "boundary", x: "centroid_x", y: "centroid_y" }),
      classes: [booleanClass("is_tumor")],
    });

    expect(sql).toContain(`"cell_id" as id`);
    expect(sql).toContain(`ST_AsWKB(ST_GeomFromText("boundary")) as geom`);
    expect(sql).toContain(`"centroid_x" as x`);
    expect(sql).toContain(`"centroid_y" as y`);
    expect(sql).toContain(`"centroid_x" BETWEEN`);
    expect(sql).toContain(`"centroid_y" BETWEEN`);
  });

  test("skips the geometry projection in point mode", () => {
    const sql = getGeomQuery(s3Uri, { z: -5, x: 0, y: 0 }, [], {
      columns: columns(),
      classes: [booleanClass("is_tumor")],
    });

    expect(sql).not.toContain("ST_AsWKB");
    expect(sql).toContain(`"object" as id`);
    expect(sql).toContain("marker_bitmask");
  });

  test("escapes double quotes inside column names", () => {
    const sql = getGeomQuery(s3Uri, tileIndex, [], {
      columns: columns({ id: 'bad"col' }),
      classes: [booleanClass('ev"il')],
    });

    expect(sql).toContain(`"bad""col" as id`);
    expect(sql).toContain(`"ev""il"`);
  });

  test("caps classes at 32 bits", () => {
    const classes = Array.from({ length: 40 }, (_, i) => booleanClass(`c${i}`));
    const sql = getGeomQuery(s3Uri, tileIndex, [], { columns: columns(), classes });

    expect(sql).toContain("<< 31");
    expect(sql).not.toContain("<< 32");
  });

  test("emits a zero bitmask when no classes are configured", () => {
    const sql = getGeomQuery(s3Uri, tileIndex, [], { columns: columns(), classes: [] });
    expect(sql).toContain("0 AS marker_bitmask");
  });

  test("keeps the legacy layout when no config is supplied", () => {
    const sql = getGeomQuery(s3Uri, tileIndex, ["marker_positive_cd4"]);
    expect(sql).toContain(`object as id`);
    expect(sql).toContain(`ST_AsWKB(ST_GeomFromText(geom)) as geom`);
    expect(sql).toContain(`(CAST(CAST("marker_positive_cd4" AS BOOLEAN) AS INTEGER) << 0)`);
  });
});
