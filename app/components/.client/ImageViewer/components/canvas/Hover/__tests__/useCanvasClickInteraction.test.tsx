import { act, render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  createCanvasTestStore,
  makeFeature,
  openTestPopup,
  viewerStoreContextMock,
  type StoreRef,
} from "../../__tests__/canvasTestStore";
import {
  useCanvasClickInteraction,
  type UseCanvasClickInteractionProps,
} from "../useCanvasClickInteraction";
import type { CanvasContentResult } from "../useCompositeHover";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

const storeRef = vi.hoisted(() => ({ current: undefined }) as { current: StoreRef["current"] });

vi.mock("../../../../state/store/core/ViewerStoreContext", () => viewerStoreContextMock(storeRef));

const content = (annotations: AnnotationFeature[]): CanvasContentResult => ({
  tooltip: annotations.length
    ? {
        panelId: 0,
        cursor: { x: 5, y: 5 },
        sections: { Annotations: [{ type: "Annotations", values: {} }] },
      }
    : {
        panelId: 0,
        cursor: { x: 5, y: 5 },
        sections: { Channels: [{ type: "Channels", values: { DAPI: { value: "42" } } }] },
      },
  annotations: annotations.map((feature) => ({
    feature,
    setId: storeRef.current!.getState().activeSetId ?? "",
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
  const { store } = createCanvasTestStore();
  storeRef.current = store;

  // Mutable indirection so tests control what buildContent returns.
  const buildArgs = { current: () => [] as AnnotationFeature[] };
  /** Full override for tests that need tooltip:null (nothing picked at all). */
  const contentOverride = { current: null as CanvasContentResult | null };
  render(<Harness buildContent={() => contentOverride.current ?? content(buildArgs.current())} />);
  const canvas = screen.getByTestId("canvas");
  return { store, canvas, buildArgs, contentOverride };
}

describe("useCanvasClickInteraction", () => {
  test("plain click selects every feature at the point and opens the popup", () => {
    const { store, buildArgs } = setup();
    const f1 = makeFeature("f1");
    const f2 = makeFeature("f2");
    buildArgs.current = () => [f1, f2];

    fireEvent.click(screen.getByTestId("canvas"));

    expect(store.getState().annotationSelectedIds).toEqual(["f1", "f2"]);
    // Top-most picked id seeds the sidebar's Shift-range anchor.
    expect(store.getState().annotationSelectionAnchorId).toBe("f1");
    expect(store.getState().popup?.panelId).toBe(0);
    expect(store.getState().popup?.annotationRefs).toEqual([
      { id: "f1", setId: store.getState().activeSetId },
      { id: "f2", setId: store.getState().activeSetId },
    ]);
  });

  test("modifier click toggles per feature (partial overlap inverts)", () => {
    const { store, buildArgs } = setup();
    store.getState().setAnnotationSelectedIds(["f1"]);
    const f1 = makeFeature("f1");
    const f2 = makeFeature("f2");
    buildArgs.current = () => [f1, f2];

    fireEvent.click(screen.getByTestId("canvas"), { metaKey: true });

    expect(store.getState().annotationSelectedIds).toEqual(["f2"]);
  });

  test("plain click with no features clears the selection and opens a channels-only popup", () => {
    const { store, buildArgs } = setup();
    store.getState().setAnnotationSelectedIds(["f1"]);
    buildArgs.current = () => [];

    fireEvent.click(screen.getByTestId("canvas"));

    expect(store.getState().annotationSelectedIds).toEqual([]);
    expect(store.getState().popup?.sections.Channels).toHaveLength(1);
    expect(store.getState().popup?.sections.Annotations).toBeUndefined();
  });

  test("a buildContent miss (nothing picked at all) clears the selection and closes", () => {
    const { store, buildArgs, contentOverride } = setup();
    store.getState().setAnnotationSelectedIds(["f1"]);
    openTestPopup(store);
    buildArgs.current = () => [];
    contentOverride.current = { tooltip: null, annotations: [] };

    fireEvent.click(screen.getByTestId("canvas"));

    expect(store.getState().annotationSelectedIds).toEqual([]);
    expect(store.getState().popup).toBeNull();
  });

  test("modifier click on feature-free pixels is a no-op", () => {
    const { store, buildArgs } = setup();
    store.getState().setAnnotationSelectedIds(["keep"]);
    buildArgs.current = () => [];

    fireEvent.click(screen.getByTestId("canvas"), { metaKey: true });

    expect(store.getState().annotationSelectedIds).toEqual(["keep"]);
    expect(store.getState().popup).toBeNull();
  });

  test("inspect-mode click opens the popup but never changes the selection", () => {
    const { store, buildArgs } = setup();
    store.getState().setAnnotationMode("inspect");
    const f1 = makeFeature("f1");
    buildArgs.current = () => [f1];

    fireEvent.click(screen.getByTestId("canvas"));

    expect(store.getState().popup?.panelId).toBe(0);
    expect(store.getState().annotationSelectedIds).toEqual([]);
  });

  test("switching into a draw mode closes the popup", () => {
    const { store } = setup();
    openTestPopup(store);
    expect(store.getState().popup).not.toBeNull();

    act(() => store.getState().setAnnotationMode("draw-polygon"));

    expect(store.getState().popup).toBeNull();
  });

  test("draw modes ignore clicks entirely", () => {
    const { store, buildArgs } = setup();
    store.getState().setAnnotationMode("draw-polygon");
    buildArgs.current = () => [makeFeature("f1")];

    fireEvent.click(screen.getByTestId("canvas"));

    expect(store.getState().annotationSelectedIds).toEqual([]);
    expect(store.getState().popup).toBeNull();
  });

  test("Escape closes the popup", () => {
    const { store } = setup();
    openTestPopup(store, {
      annotationRefs: [{ id: "f1", setId: store.getState().activeSetId! }],
    });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(store.getState().popup).toBeNull();
  });

  test("outside pointer-down closes the popup; canvas pointer-down does not", () => {
    const { store } = setup();
    openTestPopup(store);

    fireEvent.pointerDown(window, { bubbles: true });

    expect(store.getState().popup).toBeNull();

    openTestPopup(store);
    // Attached so the event propagates to the window capture listener — a
    // detached element would make this assertion vacuously pass.
    const canvasEl = document.createElement("canvas");
    document.body.appendChild(canvasEl);
    fireEvent.pointerDown(canvasEl);
    canvasEl.remove();

    expect(store.getState().popup).not.toBeNull();
  });

  test("a pan (view-state change) dismisses the popup", () => {
    const { store } = setup();
    openTestPopup(store);
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
    const { store } = setup();
    act(() =>
      store.getState().openPopup({
        panelId: 1,
        anchor: { x: 0, y: 0 },
        sections: { Annotations: [{ type: "Annotations", values: {} }] },
        annotationRefs: [],
      }),
    );

    fireEvent.keyDown(window, { key: "Escape" });

    // Panel 0 has no popup — its dismissal listeners are inactive; panel 1's
    // own instance owns the popup.
    expect(store.getState().popup?.panelId).toBe(1);
  });
});
