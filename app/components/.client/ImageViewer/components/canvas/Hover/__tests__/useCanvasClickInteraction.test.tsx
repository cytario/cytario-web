import { act, render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useStore } from "zustand";

import { createViewerStore } from "../../../../state/store/createViewerStore";
import type { ViewerStore } from "../../../../state/store/types";
import {
  useCanvasClickInteraction,
  type UseCanvasClickInteractionProps,
} from "../useCanvasClickInteraction";
import type { CanvasContentResult } from "../useCompositeHover";
import { seedViewerConnection } from "~/utils/__tests__/__mocks__";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

let currentStore: ReturnType<typeof createViewerStore>;

vi.mock("../../../../state/store/core/ViewerStoreContext", () => ({
  useViewerStore: <T,>(selector: (state: ViewerStore) => T): T => useStore(currentStore, selector),
  useViewerStoreApi: () => currentStore,
}));

const makeFeature = (id: string): AnnotationFeature => ({
  type: "Feature",
  id,
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: {},
});

const content = (annotations: AnnotationFeature[]): CanvasContentResult => ({
  tooltip: {
    panelId: 0,
    cursor: { x: 5, y: 5 },
    coordinate: [1, 2, 0],
    sections: { Annotations: [{ type: "Annotations", values: {} }] },
  },
  annotations: annotations.map((feature) => ({
    feature,
    setId: currentStore.getState().activeSetId ?? "",
    pick: {} as never,
  })),
});

function Harness({ buildContent }: Omit<UseCanvasClickInteractionProps, "imagePanelId">) {
  const { onCanvasClick } = useCanvasClickInteraction({ imagePanelId: 0, buildContent });
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- test stand-in for the deck canvas
    <div
      onClick={(e) =>
        onCanvasClick({ x: 5, y: 5, coordinate: [1, 2, 0] } as never, { srcEvent: e.nativeEvent })
      }
      data-testid="canvas"
    />
  );
}

function setup() {
  seedViewerConnection("test-conn");
  const store = createViewerStore(`test-conn/images/slide-${Math.random()}.ome.tif`, "user-a");
  store.getState().ensureOwnSet();
  store.getState().setAnnotationMode("view");
  currentStore = store;
  render(<Harness buildContent={() => content(buildArgs.current())} />);
  const canvas = screen.getByTestId("canvas");
  const click = (opts: { modifier?: boolean } = {}) =>
    fireEvent.click(canvas, {
      metaKey: opts.modifier ?? false,
    });
  return { store, canvas, click };
}

// Mutable indirection so tests control what buildContent returns.
const buildArgs = { current: () => [] as AnnotationFeature[] };

describe("useCanvasClickInteraction", () => {
  test("plain click selects every feature at the point and opens the popup", () => {
    const { store } = setup();
    const f1 = makeFeature("f1");
    const f2 = makeFeature("f2");
    buildArgs.current = () => [f1, f2];

    fireEvent.click(screen.getByTestId("canvas"));

    expect(store.getState().annotationSelectedIds).toEqual(["f1", "f2"]);
    expect(store.getState().popup?.panelId).toBe(0);
    expect(store.getState().popup?.annotationRefs).toEqual([
      { id: "f1", setId: store.getState().activeSetId },
      { id: "f2", setId: store.getState().activeSetId },
    ]);
  });

  test("modifier click toggles per feature (partial overlap inverts)", () => {
    const { store } = setup();
    store.getState().setAnnotationSelectedIds(["f1"]);
    const f1 = makeFeature("f1");
    const f2 = makeFeature("f2");
    buildArgs.current = () => [f1, f2];

    fireEvent.click(screen.getByTestId("canvas"), { metaKey: true });

    expect(store.getState().annotationSelectedIds).toEqual(["f2"]);
  });

  test("plain click on empty content clears selection and closes the popup", () => {
    const { store } = setup();
    store.getState().setAnnotationSelectedIds(["f1"]);
    store.getState().openPopup({
      panelId: 0,
      anchor: { x: 0, y: 0 },
      coordinate: [0, 0, 0],
      sections: {},
      annotationRefs: [],
    });
    buildArgs.current = () => [];

    fireEvent.click(screen.getByTestId("canvas"));

    expect(store.getState().annotationSelectedIds).toEqual([]);
    expect(store.getState().popup).toBeNull();
  });

  test("draw modes ignore clicks entirely", () => {
    const { store } = setup();
    store.getState().setAnnotationMode("draw-polygon");
    buildArgs.current = () => [makeFeature("f1")];

    fireEvent.click(screen.getByTestId("canvas"));

    expect(store.getState().annotationSelectedIds).toEqual([]);
    expect(store.getState().popup).toBeNull();
  });

  test("Escape closes the popup", () => {
    const { store } = setup();
    act(() =>
      store.getState().openPopup({
        panelId: 0,
        anchor: { x: 0, y: 0 },
        coordinate: [0, 0, 0],
        sections: { Annotations: [{ type: "Annotations", values: {} }] },
        annotationRefs: [{ id: "f1", setId: store.getState().activeSetId! }],
      }),
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(store.getState().popup).toBeNull();
  });

  test("outside pointer-down closes the popup; canvas pointer-down does not", () => {
    const { store } = setup();
    const open = () =>
      act(() =>
        store.getState().openPopup({
          panelId: 0,
          anchor: { x: 0, y: 0 },
          coordinate: [0, 0, 0],
          sections: { Annotations: [{ type: "Annotations", values: {} }] },
          annotationRefs: [],
        }),
      );
    open();

    fireEvent.pointerDown(window, { bubbles: true });

    expect(store.getState().popup).toBeNull();

    open();
    const canvasEl = document.createElement("canvas");
    fireEvent.pointerDown(canvasEl);

    expect(store.getState().popup).not.toBeNull();
  });

  test("a pan (view-state change) dismisses the popup", () => {
    const { store } = setup();
    act(() =>
      store.getState().openPopup({
        panelId: 0,
        anchor: { x: 0, y: 0 },
        coordinate: [0, 0, 0],
        sections: { Annotations: [{ type: "Annotations", values: {} }] },
        annotationRefs: [],
      }),
    );
    expect(store.getState().popup).not.toBeNull();

    act(() =>
      store.getState().setViewStateActive({
        zoom: 2,
        target: [1, 1],
        width: 10,
        height: 10,
        rotationX: 0,
        rotationOrbit: 0,
        minRotationX: -90,
        maxRotationX: 90,
        minZoom: -10,
        maxZoom: 2,
        padding: {},
      } as never),
    );

    expect(store.getState().popup).toBeNull();
  });

  test("a popup opened by another panel does not render or dismiss here", () => {
    const { store, canvas } = setup();
    act(() =>
      store.getState().openPopup({
        panelId: 1,
        anchor: { x: 0, y: 0 },
        coordinate: [0, 0, 0],
        sections: { Annotations: [{ type: "Annotations", values: {} }] },
        annotationRefs: [],
      }),
    );

    fireEvent.keyDown(window, { key: "Escape" });

    // Panel 0 has no popup — its dismissal listeners are inactive; panel 1's
    // own instance owns the popup.
    expect(store.getState().popup?.panelId).toBe(1);
    void canvas;
  });
});
