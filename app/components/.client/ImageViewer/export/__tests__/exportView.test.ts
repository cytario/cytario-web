import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("~/utils/db/getTileDataWasm", () => ({
  readAllAnnotations: vi.fn().mockResolvedValue([]),
}));

import { createViewerStore } from "../../state/store/createViewerStore";
import { captureFilename, ExportRenderError, rectangleRegionsOfOwnSets } from "../exportView";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

const rectangleFeature = (
  id: string,
  bounds: [number, number, number, number],
  name?: string,
): AnnotationFeature => ({
  type: "Feature",
  id,
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[1]],
        [bounds[2], bounds[3]],
        [bounds[0], bounds[3]],
        [bounds[0], bounds[1]],
      ],
    ],
  },
  properties: name ? { name } : {},
});

const polygonFeature = (id: string): AnnotationFeature => ({
  type: "Feature",
  id,
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [100, 0],
        [50, 80],
        [0, 0],
      ],
    ],
  },
  properties: {},
});

let store: ReturnType<typeof createViewerStore>;

const seedStore = () => {
  store = createViewerStore("conn-1/images/slide.ome.tif", "user-a");
  store.setState({
    currentUserId: "user-a",
    annotationSets: [
      {
        id: "own-set",
        createdBy: "user-a",
        name: "Own set",
        features: [
          rectangleFeature("own-rect-1", [0, 0, 512, 512], "Region A"),
          rectangleFeature("own-rect-2", [10, 10, 20, 20]),
          polygonFeature("own-poly"),
        ],
      },
      {
        id: "peer-set",
        createdBy: "user-b",
        name: "Peer set",
        features: [rectangleFeature("peer-rect", [0, 0, 100, 100], "Peer region")],
      },
      {
        id: "unowned-set",
        createdBy: undefined,
        name: "Imported",
        features: [rectangleFeature("unowned-rect", [0, 0, 50, 50], "Imported region")],
      },
    ],
    activeSetId: "own-set",
  });
};

describe("rectangleRegionsOfOwnSets", () => {
  beforeEach(seedStore);

  test("lists rectangle regions of own and unowned sets by annotation name", () => {
    const regions = rectangleRegionsOfOwnSets(store.getState());

    expect(regions.map((region) => region.id)).toEqual([
      "own-rect-1",
      "own-rect-2",
      "unowned-rect",
    ]);
    expect(regions[0].name).toBe("Region A");
    // A feature with no name falls back to its id.
    expect(regions[1].name).toBe("own-rect-2");
  });

  test("excludes peer sets and non-rectangular polygons", () => {
    const regions = rectangleRegionsOfOwnSets(store.getState());

    expect(regions.some((region) => region.setId === "peer-set")).toBe(false);
    expect(regions.some((region) => region.id === "own-poly")).toBe(false);
  });
});

describe("captureFilename", () => {
  test("formats <image-basename>_YYYY-MM-DD-HHmmss", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 7, 13, 5, 9));

    expect(captureFilename("slide")).toBe("slide_2025-01-07-130509");

    vi.useRealTimers();
  });
});

describe("rectangle-region framing inputs", () => {
  test("non-rectangle features are rejected by the region filter", () => {
    // The filter is the guard the export's annotation-region path relies on;
    // a non-closed or skewed 5-ring must not be offered as a region.
    const skewed: AnnotationFeature = {
      type: "Feature",
      id: "skewed",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [12, 10],
            [0, 8],
            [0, 0],
          ],
        ],
      },
      properties: {},
    };
    store = createViewerStore("conn-1/images/slide.ome.tif", "user-a");
    store.setState({
      currentUserId: "user-a",
      annotationSets: [{ id: "own", createdBy: "user-a", name: undefined, features: [skewed] }],
      activeSetId: "own",
    });

    expect(rectangleRegionsOfOwnSets(store.getState())).toEqual([]);
  });
});

describe("ExportRenderError", () => {
  test("carries an actionable message", () => {
    const error = new ExportRenderError("boom");
    expect(error.name).toBe("ExportRenderError");
    expect(error.message).toBe("boom");
  });
});
