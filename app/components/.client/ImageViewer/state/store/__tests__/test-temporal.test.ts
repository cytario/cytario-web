import { describe, it, expect } from "vitest";
import type { StoreApi } from "zustand";

import { createViewerStore } from "../createViewerStore";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

type ZundoTemporalState = {
  pastStates: unknown[];
  futureStates: unknown[];
  undo: () => void;
  redo: () => void;
  pause: () => void;
  resume: () => void;
};

type ZundoTemporalStoreApi = StoreApi<ZundoTemporalState>;

const pointFeature = (id: string): AnnotationFeature =>
  ({
    type: "Feature" as const,
    id,
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  }) as AnnotationFeature;

const getTemporal = (store: ReturnType<typeof createViewerStore>): ZundoTemporalStoreApi =>
  (store as unknown as { temporal?: ZundoTemporalStoreApi }).temporal!;

describe("temporal history", () => {
  it("records history after updateUserFeatures", () => {
    const store = createViewerStore("test/image.ome.tif");

    const temporal = getTemporal(store);
    expect(temporal).toBeDefined();

    const before = temporal.getState().pastStates.length;

    store.getState().updateUserFeatures("user-a", [pointFeature("f1")]);

    const after = temporal.getState().pastStates.length;
    expect(after).toBeGreaterThan(before);
  });

  it("does not block real edits after ephemeral state changes (no cooldown from unrelated sets)", () => {
    const store = createViewerStore("test/image.ome.tif");
    const temporal = getTemporal(store);

    // Simulate ephemeral state changes (draw mode, selection, etc.)
    // that don't touch annotationsByUser or annotationClasses
    store.setState({ annotationMode: "draw-point" });
    store.setState({ annotationMode: "draw-polygon" });
    store.setState({ annotationSelectedIds: ["some-id"] });

    // Now perform a real annotation edit — it should still be recorded
    const before = temporal.getState().pastStates.length;
    store.getState().updateUserFeatures("user-a", [pointFeature("f1")]);

    const after = temporal.getState().pastStates.length;
    expect(after).toBeGreaterThan(before);
  });
});
