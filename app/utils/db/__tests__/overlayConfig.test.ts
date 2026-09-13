import {
  OVERLAY_CLASS_BIT_LIMIT,
  interpretOverlaySchema,
  overlayConfigHash,
  validateOverlayConfig,
} from "../overlayConfig";
import type { ParquetColumn } from "~/components/DataGrid/getParquetSchema";

const col = (name: string, type: string): ParquetColumn => ({ name, type });

const canonicalSchema = (): ParquetColumn[] => [
  col("object", "INT32"),
  col("x", "DOUBLE"),
  col("y", "DOUBLE"),
  col("marker_positive_cd4", "BOOLEAN"),
  col("marker_positive_pd-1", "BOOLEAN"),
  col("geom", "VARCHAR"),
];

describe("interpretOverlaySchema", () => {
  test("maps the canonical marker_positive_ layout to boolean classes", () => {
    const config = interpretOverlaySchema(canonicalSchema());

    expect(config).not.toBeNull();
    expect(config?.columns).toEqual({ id: "object", geometry: "geom", x: "x", y: "y" });
    expect(config?.classes).toHaveLength(2);
    expect(config?.classes[0]).toEqual({
      sourceColumn: "marker_positive_cd4",
      label: "cd4",
      mode: "boolean",
    });
    expect(config?.classes[1]?.label).toBe("pd-1");
  });

  test("treats boolean-typed columns as candidate classes", () => {
    const config = interpretOverlaySchema([
      col("cell_id", "VARCHAR"),
      col("x", "DOUBLE"),
      col("y", "DOUBLE"),
      col("is_tumor", "BOOLEAN"),
      col("is_immune", "BOOLEAN"),
      col("geometry", "VARCHAR"),
    ]);

    expect(config?.columns).toEqual({
      id: "cell_id",
      geometry: "geometry",
      x: "x",
      y: "y",
    });
    expect(config?.classes.map((c) => c.sourceColumn)).toEqual(["is_tumor", "is_immune"]);
    expect(config?.classes.every((c) => c.mode === "boolean")).toBe(true);
  });

  test("treats threshold-able numeric columns as threshold classes", () => {
    const config = interpretOverlaySchema([
      col("object", "INT32"),
      col("x", "FLOAT"),
      col("y", "FLOAT"),
      col("cd8_intensity", "DOUBLE"),
      col("foxp3_intensity", "DOUBLE"),
    ]);

    expect(config?.classes).toHaveLength(2);
    expect(config?.classes[0]).toEqual({
      sourceColumn: "cd8_intensity",
      label: "cd8_intensity",
      mode: "threshold",
      operator: ">",
      threshold: 0,
    });
  });

  test("returns null when no id or coordinate columns exist", () => {
    expect(interpretOverlaySchema([col("value", "DOUBLE"), col("name", "VARCHAR")])).toBeNull();
  });

  test("returns null when no classifiable columns exist", () => {
    expect(
      interpretOverlaySchema([
        col("object", "INT32"),
        col("x", "DOUBLE"),
        col("y", "DOUBLE"),
        col("geom", "VARCHAR"),
      ]),
    ).toBeNull();
  });

  test("returns null for an empty schema", () => {
    expect(interpretOverlaySchema([])).toBeNull();
  });

  test("caps classes at the 32-bit bitmask limit, keeping the first 32", () => {
    const schema: ParquetColumn[] = [
      col("object", "INT32"),
      col("x", "DOUBLE"),
      col("y", "DOUBLE"),
      ...Array.from({ length: 40 }, (_, i) => col(`col_${i}`, "BOOLEAN")),
    ];

    const config = interpretOverlaySchema(schema);
    expect(config?.classes).toHaveLength(OVERLAY_CLASS_BIT_LIMIT);
    expect(config?.classes[0]?.sourceColumn).toBe("col_0");
    expect(config?.classes[31]?.sourceColumn).toBe("col_31");
  });
});

describe("validateOverlayConfig", () => {
  test("accepts a config whose columns exist with compatible types", () => {
    const config = interpretOverlaySchema(canonicalSchema());
    expect(validateOverlayConfig(config!, canonicalSchema())).toBe(true);
  });

  test("rejects a config referencing a missing column", () => {
    const config = interpretOverlaySchema(canonicalSchema())!;
    expect(
      validateOverlayConfig(
        { ...config, columns: { ...config.columns, x: "missing" } },
        canonicalSchema(),
      ),
    ).toBe(false);
  });

  test("rejects a threshold class on a non-numeric source column", () => {
    const config = interpretOverlaySchema(canonicalSchema())!;
    const schema = canonicalSchema();
    expect(
      validateOverlayConfig(
        {
          ...config,
          classes: [
            { sourceColumn: "geom", label: "g", mode: "threshold", operator: ">", threshold: 1 },
          ],
        },
        schema,
      ),
    ).toBe(false);
  });

  test("rejects a threshold class without a valid operator or threshold", () => {
    const config = interpretOverlaySchema(canonicalSchema())!;
    const schema = [
      col("object", "INT32"),
      col("x", "DOUBLE"),
      col("y", "DOUBLE"),
      col("intensity", "DOUBLE"),
    ];
    expect(
      validateOverlayConfig(
        {
          ...config,
          classes: [
            {
              sourceColumn: "intensity",
              label: "i",
              mode: "threshold",
              operator: "~" as never,
              threshold: 1,
            },
          ],
        },
        schema,
      ),
    ).toBe(false);
    expect(
      validateOverlayConfig(
        {
          ...config,
          classes: [{ sourceColumn: "intensity", label: "i", mode: "threshold", operator: ">" }],
        },
        schema,
      ),
    ).toBe(false);
  });

  test("rejects a continuous-mode class until continuous rendering ships", () => {
    const config = interpretOverlaySchema(canonicalSchema())!;
    expect(
      validateOverlayConfig(
        {
          ...config,
          classes: [{ sourceColumn: "marker_positive_cd4", label: "cd4", mode: "continuous" }],
        },
        canonicalSchema(),
      ),
    ).toBe(false);
  });

  test("rejects a boolean-mode class on a VARCHAR column", () => {
    const config = interpretOverlaySchema(canonicalSchema())!;
    expect(
      validateOverlayConfig(
        { ...config, columns: { ...config.columns, id: "geom", x: "x", y: "y" } },
        [],
      ),
    ).toBe(false);
  });

  test("accepts an optional empty geometry mapping", () => {
    const config = interpretOverlaySchema(canonicalSchema())!;
    expect(
      validateOverlayConfig(
        { ...config, columns: { ...config.columns, geometry: "" } },
        canonicalSchema(),
      ),
    ).toBe(true);
  });
});

describe("overlayConfigHash", () => {
  test("is stable for identical configs and distinguishes different ones", () => {
    const a = interpretOverlaySchema(canonicalSchema());
    const b = interpretOverlaySchema(canonicalSchema());
    expect(overlayConfigHash(a)).toBe(overlayConfigHash(b));

    const changed = { ...a!, classes: a!.classes.slice(0, 1) };
    expect(overlayConfigHash(changed)).not.toBe(overlayConfigHash(a));
    expect(overlayConfigHash(null)).toBe("none");
  });
});
