import { describe, expect, it, vi } from "vitest";

import { validAnnotationFeatures } from "../annotationSchema";

// A closed square ring (5 positions, first == last).
const SQUARE: number[][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
  [0, 0],
];

// `id` defaults to a valid top-level GeoJSON id so geometry/color tests isolate
// their concern; pass `undefined`/a non-string to exercise the id rule itself.
const point = (coords: unknown = [5, 5], props: object = {}, id: unknown = "pt-1") => ({
  type: "Feature",
  ...(id === undefined ? {} : { id }),
  geometry: { type: "Point", coordinates: coords },
  properties: props,
});

const polygon = (rings: unknown, props: object = {}, id: unknown = "poly-1") => ({
  type: "Feature",
  ...(id === undefined ? {} : { id }),
  geometry: { type: "Polygon", coordinates: rings },
  properties: props,
});

describe("validAnnotationFeatures — dropping malformed geometry", () => {
  it("drops a polygon with a null coordinate ([[null]])", () => {
    expect(validAnnotationFeatures([polygon([[null]])])).toHaveLength(0);
  });

  it("drops a ring with fewer than 3 distinct corners", () => {
    expect(
      validAnnotationFeatures([
        polygon([
          [
            [0, 0],
            [1, 1],
          ],
        ]),
      ]),
    ).toHaveLength(0);
  });

  it("drops a point with a non-finite / null coordinate", () => {
    expect(validAnnotationFeatures([point([null, 5])])).toHaveLength(0);
    expect(validAnnotationFeatures([point([NaN, 5])])).toHaveLength(0);
    expect(validAnnotationFeatures([point([5])])).toHaveLength(0);
  });

  it("drops non-feature junk and returns [] for a non-array", () => {
    expect(validAnnotationFeatures([{ nope: true }, 42, null])).toHaveLength(0);
    expect(validAnnotationFeatures(undefined)).toEqual([]);
    expect(validAnnotationFeatures("not-an-array")).toEqual([]);
  });

  it("logs when it drops an invalid feature", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    validAnnotationFeatures([polygon([[null]])]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("validAnnotationFeatures — keeping valid geometry", () => {
  it("keeps a valid point", () => {
    const out = validAnnotationFeatures([point([5, 5])]);
    expect(out).toHaveLength(1);
    expect(out[0].geometry).toEqual({ type: "Point", coordinates: [5, 5] });
  });

  it("keeps a valid closed polygon unchanged", () => {
    const out = validAnnotationFeatures([polygon([SQUARE])]);
    expect(out).toHaveLength(1);
    expect(out[0].geometry.type).toBe("Polygon");
    expect((out[0].geometry as { coordinates: number[][][] }).coordinates[0]).toEqual(SQUARE);
  });

  it("drops an open-ring polygon (rings are not auto-closed)", () => {
    // 4 positions but first != last: valid length, not closed → rejected (deck
    // emits closed rings; we don't repair open ones).
    const openQuad = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(validAnnotationFeatures([polygon([openQuad])])).toHaveLength(0);
  });

  it("keeps a valid multipolygon", () => {
    const out = validAnnotationFeatures([
      {
        type: "Feature",
        id: "mp-1",
        geometry: { type: "MultiPolygon", coordinates: [[SQUARE]] },
        properties: {},
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].geometry.type).toBe("MultiPolygon");
  });
});

describe("validAnnotationFeatures — classification color", () => {
  it("keeps a valid RGB classification", () => {
    const out = validAnnotationFeatures([
      point([1, 1], { classification: { name: "Tumor", color: [255, 0, 0] } }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].properties.classification).toEqual({ name: "Tumor", color: [255, 0, 0] });
  });

  it("coerces a legacy RGBA color to RGB (drops alpha) instead of dropping the feature", () => {
    const out = validAnnotationFeatures([
      point([1, 1], { classification: { name: "Stroma", color: [10, 20, 30, 128] } }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].properties.classification!.color).toEqual([10, 20, 30]);
  });

  it("drops a feature whose classification color has fewer than 3 channels", () => {
    const out = validAnnotationFeatures([
      point([1, 1], { classification: { name: "Bad", color: [10, 20] } }),
    ]);
    expect(out).toHaveLength(0);
  });
});

describe("validAnnotationFeatures — top-level feature.id", () => {
  it("keeps the feature's top-level id", () => {
    const out = validAnnotationFeatures([point([1, 1], {}, "abc-123")]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("abc-123");
  });

  it("drops a feature with no id (no synthetic fallback)", () => {
    // A raw feature with no top-level id (the helper's default would inject one).
    const noId = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [1, 1] },
      properties: {},
    };
    expect(validAnnotationFeatures([noId])).toHaveLength(0);
  });

  it("drops a feature with a non-string (numeric) id", () => {
    expect(validAnnotationFeatures([point([1, 1], {}, 42)])).toHaveLength(0);
  });

  it("drops a feature with an empty-string id", () => {
    expect(validAnnotationFeatures([point([1, 1], {}, "")])).toHaveLength(0);
  });
});
