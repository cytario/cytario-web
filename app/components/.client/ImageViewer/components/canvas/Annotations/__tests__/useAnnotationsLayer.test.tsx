import { renderHook } from "@testing-library/react";
import { describe, expect, it, test, vi } from "vitest";

import { createViewerStore } from "../../../../state/store/createViewerStore";
import { useAnnotationsLayer } from "../useAnnotationsLayer";
import { seedViewerConnection } from "~/utils/__tests__/__mocks__";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

let store: ReturnType<typeof createViewerStore>;

vi.mock("../../../../state/store/core/ViewerStoreContext", () => ({
  useViewerStore: (selector: (s: unknown) => unknown) => selector(store.getState()),
}));
vi.mock("~/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ sub: "me" }),
}));

/** The editable own-set layer is always the last layer the hook returns. */
const editableOnEdit = (layers: unknown[]) =>
  (layers[layers.length - 1] as { props: { onEdit: (params: unknown) => void } }).props.onEdit;
const drawnFeature = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [10, 20] },
  properties: {},
};

const addFeatureEdit = {
  updatedData: { type: "FeatureCollection", features: [drawnFeature] },
  editType: "addFeature",
  editContext: { featureIndexes: [0] },
};

/** Features of the active (own) set after a draw. */
const activeSetFeatures = () => {
  const s = store.getState();
  return s.annotationSets.find((set) => set.id === s.activeSetId)!.features;
};

describe("useAnnotationsLayer onEdit", () => {
  it("stamps a freshly created class with zero members onto a new draw (C-328)", () => {
    seedViewerConnection("test-conn");
    store = createViewerStore("test-conn/images/c328-empty-class.ome.tif", "me");
    const activeSetId = store.getState().ensureOwnSet();
    const name = store.getState().createAnnotationClass(activeSetId, "Tumor");
    const { color } = store.getState().annotationClasses[activeSetId]![0];

    const { result } = renderHook(() => useAnnotationsLayer(0));
    editableOnEdit(result.current.layers)(addFeatureEdit);

    const [stamped] = activeSetFeatures();
    expect(stamped.properties?.classification).toEqual({ name, color });
    expect(stamped.id).toBeTruthy();
  });

  it("leaves a draw unclassified when no class is active", () => {
    seedViewerConnection("test-conn");
    store = createViewerStore("test-conn/images/c328-no-active.ome.tif", "me");

    const { result } = renderHook(() => useAnnotationsLayer(0));
    editableOnEdit(result.current.layers)(addFeatureEdit);

    const [stamped] = activeSetFeatures();
    expect(stamped.properties?.classification).toBeUndefined();
  });
});

describe("useAnnotationsLayer excluded feature", () => {
  const featuresOf = (layer: unknown) =>
    (layer as { props: { data: { features: unknown[] } } }).props.data.features;

  test("drops the excluded feature from the own and peer layers", () => {
    seedViewerConnection("test-conn");
    store = createViewerStore("test-conn/images/exclude-region.ome.tif", "me");
    const setId = store.getState().ensureOwnSet();
    const kept: AnnotationFeature = {
      type: "Feature",
      id: "kept-1",
      geometry: { type: "Point", coordinates: [1, 1] },
      properties: {},
    };
    const excluded: AnnotationFeature = {
      type: "Feature",
      id: "region-1",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [9, 0],
            [9, 9],
            [0, 0],
          ],
        ],
      },
      properties: {},
    };
    store.getState().updateSetFeatures(setId, [kept, excluded]);
    store
      .getState()
      .seedAnnotations([
        { id: "peer-set", createdBy: "peer", features: [kept, excluded], name: undefined },
      ]);

    const { result: withAll } = renderHook(() => useAnnotationsLayer(0, false, null));
    const { result: excluding } = renderHook(() => useAnnotationsLayer(0, false, "region-1"));

    const annotationData = (layers: unknown[]) =>
      layers.filter((layer) => String((layer as { id: string }).id).startsWith("annotations-0"));

    // Without exclusion both features render in own and peer layers.
    expect(annotationData(withAll.current.layers).flatMap(featuresOf)).toHaveLength(4);

    // With exclusion, every annotations layer drops the region feature.
    const remaining = annotationData(excluding.current.layers).flatMap(featuresOf);
    expect(remaining).toHaveLength(2);
    expect(remaining.every((f) => (f as { id: string }).id !== "region-1")).toBe(true);
  });
});

describe("useAnnotationsLayer stamp size", () => {
  const stampConfig = (layers: unknown[]) =>
    (layers[layers.length - 1] as { props: { modeConfig?: Record<string, unknown> } }).props
      .modeConfig;

  test("the stamp tool draws at the stored stamp size and follows its changes", () => {
    seedViewerConnection("test-conn");
    store = createViewerStore("test-conn/images/stamp-size.ome.tif", "me");
    store.getState().setAnnotationMode("draw-box");
    store.getState().setAnnotationStampSize(250, 500);

    const { result, rerender } = renderHook(() => useAnnotationsLayer(0));
    expect(stampConfig(result.current.layers)).toMatchObject({
      stampWidthPx: 250,
      stampHeightPx: 500,
    });

    store.getState().setAnnotationStampSize(40, 80);
    rerender();
    expect(stampConfig(result.current.layers)).toMatchObject({
      stampWidthPx: 40,
      stampHeightPx: 80,
    });
  });
});
