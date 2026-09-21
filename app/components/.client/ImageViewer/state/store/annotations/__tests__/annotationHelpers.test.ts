import { describe, expect, test } from "vitest";

import { translateGeometry } from "../annotationHelpers";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

const DELTA: [number, number] = [10, -5];

describe("translateGeometry", () => {
  test("translates a point", () => {
    const geometry = { type: "Point" as const, coordinates: [100, 200] };
    expect(translateGeometry(geometry, DELTA)).toEqual({
      type: "Point",
      coordinates: [110, 195],
    });
  });

  test("translates every ring of a polygon without mutating the source", () => {
    const geometry = {
      type: "Polygon" as const,
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 0],
        ],
      ],
    };
    const translated = translateGeometry(geometry, DELTA);
    expect(translated).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [10, -5],
          [20, -5],
          [20, 5],
          [10, -5],
        ],
      ],
    });
    expect(geometry.coordinates[0][0]).toEqual([0, 0]);
  });

  test("translates every polygon of a multipolygon", () => {
    const geometry = {
      type: "MultiPolygon" as const,
      coordinates: [
        [
          [
            [0, 0],
            [1, 1],
          ],
        ],
        [
          [
            [5, 5],
            [6, 6],
          ],
        ],
      ],
    };
    expect(translateGeometry(geometry, DELTA)).toEqual({
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [10, -5],
            [11, -4],
          ],
        ],
        [
          [
            [15, 0],
            [16, 1],
          ],
        ],
      ],
    });
  });

  test("preserves altitude channels on positions", () => {
    const geometry = { type: "Point" as const, coordinates: [1, 2, 3] };
    expect(translateGeometry(geometry, DELTA)).toEqual({
      type: "Point",
      coordinates: [11, -3, 3],
    });
  });

  test("accepts the annotation feature geometry union", () => {
    const geometry: AnnotationFeature["geometry"] = {
      type: "Point",
      coordinates: [0, 0],
    };
    expect(translateGeometry(geometry, DELTA).coordinates).toEqual([10, -5]);
  });
});
