import type { OverlayClassConfig } from "../overlayConfig";
import { buildOverlayCopyProjection } from "../sqlQueries";

describe("buildOverlayCopyProjection", () => {
  test("projects mapped id/x/y/geom columns plus class source columns", () => {
    const sql = buildOverlayCopyProjection(
      { id: "cell_id", geometry: "boundary", x: "centroid_x", y: "centroid_y" },
      [
        { sourceColumn: "is_tumor", label: "tumor", mode: "boolean" },
        { sourceColumn: "cd8", label: "cd8", mode: "threshold", operator: ">", threshold: 1 },
      ],
    );

    expect(sql).toContain(`"cell_id" as object`);
    expect(sql).toContain(`"centroid_x" as x`);
    expect(sql).toContain(`"centroid_y" as y`);
    expect(sql).toContain(`ST_AsText("boundary") as geom`);
    expect(sql).toContain(`"is_tumor"`);
    expect(sql).toContain(`"cd8"`);
  });

  test("escapes double quotes in column names", () => {
    const sql = buildOverlayCopyProjection({ id: 'bad"id', geometry: "geom", x: "x", y: "y" }, [
      { sourceColumn: 'ev"il', label: "e", mode: "boolean" },
    ]);

    expect(sql).toContain(`"bad""id" as object`);
    expect(sql).toContain(`"ev""il"`);
  });

  test("omits class columns when no classes are configured", () => {
    const sql = buildOverlayCopyProjection({ id: "object", geometry: "geom", x: "x", y: "y" }, []);

    expect(sql).not.toContain(`"a"`);
    expect(sql).toContain(`ST_AsText("geom") as geom`);
  });

  test("includes classes in bitmask order", () => {
    const classes: OverlayClassConfig[] = [
      { sourceColumn: "a", label: "a", mode: "boolean" },
      { sourceColumn: "b", label: "b", mode: "boolean" },
    ];
    const sql = buildOverlayCopyProjection(
      { id: "object", geometry: "geom", x: "x", y: "y" },
      classes,
    );
    expect(sql.indexOf(`"a"`)).toBeLessThan(sql.indexOf(`"b"`));
  });
});
