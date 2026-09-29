import { describe, expect, test } from "vitest";

import { createViewerStore } from "../../../state/store/createViewerStore";
import { joinFeaturesInSet, qualifyJoin, unionJoinRegions } from "../joinFeatures";
import { seedViewerConnection } from "~/utils/__tests__/__mocks__";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

const ring = (x0: number, y0: number, x1: number, y1: number) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

const makeRegion = (
  id: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  className = "Tumor",
): AnnotationFeature => ({
  type: "Feature",
  id,
  geometry: { type: "Polygon", coordinates: [ring(x0, y0, x1, y1)] },
  properties: { classification: { name: className, color: [255, 0, 0] } },
});

const makePoint = (id: string, className = "Tumor"): AnnotationFeature => ({
  type: "Feature",
  id,
  geometry: { type: "Point", coordinates: [5, 5] },
  properties: { classification: { name: className, color: [255, 0, 0] } },
});

describe("qualifyJoin", () => {
  test("qualifies ≥2 same-class regions", () => {
    const q = qualifyJoin([makeRegion("a", 0, 0, 5, 5), makeRegion("b", 2, 2, 8, 8)]);
    expect(q?.className).toBe("Tumor");
    expect(q?.regions).toHaveLength(2);
  });

  test("rejects a single feature, cross-class sets, and points", () => {
    expect(qualifyJoin([makeRegion("a", 0, 0, 5, 5)])).toBeNull();
    expect(
      qualifyJoin([makeRegion("a", 0, 0, 5, 5), makeRegion("b", 2, 2, 8, 8, "Stroma")]),
    ).toBeNull();
    expect(qualifyJoin([makePoint("a"), makePoint("b")])).toBeNull();
  });

  test("rejects when fewer than 2 regions survive the region filter", () => {
    expect(qualifyJoin([makeRegion("a", 0, 0, 5, 5), makePoint("b")])).toBeNull();
  });
});

describe("unionJoinRegions", () => {
  test("overlapping regions union to one Polygon", () => {
    const merged = unionJoinRegions(
      [makeRegion("a", 0, 0, 5, 5), makeRegion("b", 2, 2, 8, 8)],
      makeRegion("a", 0, 0, 5, 5),
    );
    expect(merged?.geometry.type).toBe("Polygon");
    expect(merged?.id).toBe("a");
  });

  test("disjoint regions union to a MultiPolygon under one id", () => {
    const merged = unionJoinRegions(
      [makeRegion("a", 0, 0, 2, 2), makeRegion("b", 10, 10, 14, 14)],
      makeRegion("a", 0, 0, 2, 2),
    );
    expect(merged?.geometry.type).toBe("MultiPolygon");
    expect(merged?.id).toBe("a");
  });

  test("a self-intersecting (bowtie) ring does not throw — polclip is lenient", () => {
    // Spike result: polclip-ts handles self-intersecting boundaries without
    // throwing and emits *some* geometry; the try/catch in unionJoinRegions
    // remains as the net for inputs it does reject.
    const bowtie: AnnotationFeature = {
      type: "Feature",
      id: "b1",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [5, 5],
            [5, 0],
            [0, 5],
            [0, 0],
          ],
        ],
      },
      properties: { classification: { name: "Tumor", color: [255, 0, 0] } },
    };
    const merged = unionJoinRegions([bowtie, makeRegion("b2", 2, 2, 8, 8)], bowtie);
    expect(merged).not.toBeNull();
    expect(merged?.geometry.type).toMatch(/Polygon/);
  });

  test("keeps the survivor's classification", () => {
    const merged = unionJoinRegions(
      [makeRegion("a", 0, 0, 5, 5), makeRegion("b", 2, 2, 8, 8)],
      makeRegion("a", 0, 0, 5, 5),
    );
    expect(merged?.properties?.classification?.name).toBe("Tumor");
  });
});

describe("joinFeaturesInSet", () => {
  function setup(features: AnnotationFeature[]) {
    seedViewerConnection("test-conn");
    const store = createViewerStore(`test-conn/images/slide-${Math.random()}.ome.tif`, "user-a");
    const setId = store.getState().ensureOwnSet();
    store.getState().updateSetFeatures(setId, features);
    // The seed write starts the undo-gesture debounce (500 ms); the join in
    // each test is a separate gesture, so reset the cool-off like a real
    // session would after the debounce elapses.
    (
      store as unknown as { __temporalState?: { resetCooldown: () => void } }
    ).__temporalState?.resetCooldown();
    return { store, setId };
  }

  test("joins two same-class regions: one survivor, selection moves to it", () => {
    const { store, setId } = setup([makeRegion("f1", 0, 0, 5, 5), makeRegion("f2", 2, 2, 8, 8)]);

    const survivorId = joinFeaturesInSet(store, setId, ["f1", "f2"]);

    const set = store.getState().annotationSets.find((s) => s.id === setId)!;
    expect(set.features).toHaveLength(1);
    expect(set.features[0].id).toBe(survivorId);
    expect(set.features[0].geometry.type).toBe("Polygon");
    expect(store.getState().annotationSelectedIds).toEqual([survivorId]);
    expect(store.getState().annotationSelectionAnchorId).toBe(survivorId);
  });

  test("the lowest-index feature survives and keeps its identity", () => {
    const { store, setId } = setup([
      makeRegion("keep-me", 0, 0, 5, 5),
      makeRegion("drop-me", 2, 2, 8, 8),
    ]);

    const survivorId = joinFeaturesInSet(store, setId, ["keep-me", "drop-me"]);

    const set = store.getState().annotationSets.find((s) => s.id === setId)!;
    expect(survivorId).toBe("keep-me");
    expect(set.features[0].id).toBe("keep-me");
    expect(set.features[0].properties?.classification?.name).toBe("Tumor");
  });

  test("unrelated features in the set are untouched", () => {
    const bystander = makeRegion("bystander", 100, 100, 110, 110);
    const { store, setId } = setup([
      makeRegion("f1", 0, 0, 5, 5),
      makeRegion("f2", 2, 2, 8, 8),
      bystander,
    ]);

    joinFeaturesInSet(store, setId, ["f1", "f2"]);

    const set = store.getState().annotationSets.find((s) => s.id === setId)!;
    expect(set.features.map((f) => f.id)).toEqual(["f1", "bystander"]);
  });

  test("does not qualify cross-class or single-feature targets", () => {
    const { store, setId } = setup([
      makeRegion("f1", 0, 0, 5, 5),
      makeRegion("f2", 2, 2, 8, 8, "Stroma"),
      makePoint("p1"),
    ]);

    expect(joinFeaturesInSet(store, setId, ["f1", "f2"])).toBeNull();
    expect(joinFeaturesInSet(store, setId, ["f1"])).toBeNull();
    expect(joinFeaturesInSet(store, setId, ["f1", "p1"])).toBeNull();
    expect(joinFeaturesInSet(store, setId, ["p1", "p1"])).toBeNull();
    const set = store.getState().annotationSets.find((s) => s.id === setId)!;
    expect(set.features).toHaveLength(3);
  });

  test("undo restores the swallowed features", () => {
    const { store, setId } = setup([makeRegion("f1", 0, 0, 5, 5), makeRegion("f2", 2, 2, 8, 8)]);

    joinFeaturesInSet(store, setId, ["f1", "f2"]);
    expect(store.getState().annotationSets.find((s) => s.id === setId)!.features).toHaveLength(1);

    const temporal = (
      store as unknown as {
        temporal?: { getState: () => { undo: () => void } };
      }
    ).temporal;
    temporal?.getState().undo();

    const set = store.getState().annotationSets.find((s) => s.id === setId)!;
    expect(set.features.map((f) => f.id)).toEqual(["f1", "f2"]);
  });

  test("unknown ids and unknown sets are no-ops", () => {
    const { store, setId } = setup([makeRegion("f1", 0, 0, 5, 5)]);

    expect(joinFeaturesInSet(store, setId, ["ghost"])).toBeNull();
    expect(joinFeaturesInSet(store, "nope", ["f1"])).toBeNull();
    expect(store.getState().annotationSets.find((s) => s.id === setId)!.features).toHaveLength(1);
  });
});
