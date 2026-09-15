import type { PointsElement, SpatialData } from "@spatialdata/core";
import { describe, expect, test, vi } from "vitest";

import { suppressPointsRowFeatureCodes } from "../suppressPointsRowFeatureCodes";

const mockPointsElement = (key: string): PointsElement => {
  const element = {
    kind: "points",
    key,
    loadPoints: vi.fn(async () => ({ data: [], shape: [2, 0] })),
    loadRowFeatureCodes: vi.fn(async () => new Uint32Array([3, 1, 3])),
  };
  return element as unknown as PointsElement;
};

const mockSpatialData = (points?: Record<string, PointsElement>): SpatialData =>
  ({
    images: { blobs_image: { kind: "images", key: "blobs_image" } },
    ...(points ? { points } : {}),
    coordinateSystems: ["global"],
  }) as unknown as SpatialData;

describe("suppressPointsRowFeatureCodes", () => {
  test("replaces loadRowFeatureCodes with an immediate undefined settle", async () => {
    const element = mockPointsElement("transcripts");

    const result = suppressPointsRowFeatureCodes(mockSpatialData({ transcripts: element }));

    const suppressed = result.points?.transcripts;
    expect(suppressed).toBeDefined();
    expect(suppressed).not.toBe(element);
    await expect(suppressed?.loadRowFeatureCodes()).resolves.toBeUndefined();
  });

  test("leaves the geometry preload and element identity of the original intact", async () => {
    const element = mockPointsElement("transcripts");

    suppressPointsRowFeatureCodes(mockSpatialData({ transcripts: element }));

    await expect(element.loadRowFeatureCodes()).resolves.toEqual(new Uint32Array([3, 1, 3]));
  });

  test("preserves prototype methods and element metadata on the clone", () => {
    const element = mockPointsElement("transcripts");

    const result = suppressPointsRowFeatureCodes(mockSpatialData({ transcripts: element }));

    const clone = result.points?.transcripts as unknown as Record<string, unknown>;
    expect(clone.key).toBe("transcripts");
    expect(clone.kind).toBe("points");
    expect(typeof clone.loadPoints).toBe("function");
  });

  test("passes spatial data through untouched when there are no points", () => {
    const spatialData = mockSpatialData();

    expect(suppressPointsRowFeatureCodes(spatialData)).toBe(spatialData);
  });
});
