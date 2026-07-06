import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createViewerStore } from "../../../../state/store/createViewerStore";
import { useAnnotationsLayer } from "../useAnnotationsLayer";

let store: ReturnType<typeof createViewerStore>;

vi.mock("../../../../state/store/ViewerStoreContext", () => ({
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

describe("useAnnotationsLayer onEdit", () => {
  it("stamps a freshly created class with zero members onto a new draw (C-328)", () => {
    store = createViewerStore("c328-empty-class");
    const name = store.getState().createAnnotationClass("Tumor");
    const { color } = store.getState().annotationClasses[0];

    const { result } = renderHook(() => useAnnotationsLayer(0));
    editableOnEdit(result.current)(addFeatureEdit);

    const [stamped] = store.getState().annotationsByUser["me"];
    expect(stamped.properties?.classification).toEqual({ name, color });
    expect(stamped.id).toBeTruthy();
  });

  it("leaves a draw unclassified when no class is active", () => {
    store = createViewerStore("c328-no-active");

    const { result } = renderHook(() => useAnnotationsLayer(0));
    editableOnEdit(result.current)(addFeatureEdit);

    const [stamped] = store.getState().annotationsByUser["me"];
    expect(stamped.properties?.classification).toBeUndefined();
  });
});
