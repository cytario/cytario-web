import { act, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useStore } from "zustand";

import { createViewerStore } from "../../../../state/store/createViewerStore";
import type { ViewerStore } from "../../../../state/store/types";
import { ImagePopupLayer } from "../ImagePopupLayer";
import { seedViewerConnection } from "~/utils/__tests__/__mocks__";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

let currentStore: ReturnType<typeof createViewerStore>;

vi.mock("../../../../state/store/core/ViewerStoreContext", () => ({
  useViewerStore: <T,>(selector: (state: ViewerStore) => T): T => useStore(currentStore, selector),
  useViewerStoreApi: () => currentStore,
}));

const makeFeature = (id: string, className?: string): AnnotationFeature => ({
  type: "Feature",
  id,
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: {
    ...(className ? { classification: { name: className, color: [255, 0, 0] } } : {}),
  },
});

function setup() {
  seedViewerConnection("test-conn");
  const store = createViewerStore(`test-conn/images/slide-${Math.random()}.ome.tif`, "user-a");
  const setId = store.getState().ensureOwnSet();
  store.getState().setAnnotationMode("view");
  currentStore = store;
  render(<ImagePopupLayer imagePanelId={0} />);
  const openPopup = (annotationRefs: { id: string; setId: string }[]) =>
    act(() =>
      store.getState().openPopup({
        panelId: 0,
        anchor: { x: 0, y: 0 },
        sections: { Annotations: [{ type: "Annotations", values: {} }] },
        annotationRefs,
      }),
    );
  return { store, setId, openPopup };
}

describe("ImagePopupLayer", () => {
  test("renders the popup for the owning panel only", () => {
    const { store, setId } = setup();
    store.getState().updateSetFeatures(setId, [makeFeature("f1")]);
    act(() =>
      store.getState().openPopup({
        panelId: 0,
        anchor: { x: 0, y: 0 },
        sections: { Annotations: [{ type: "Annotations", values: {} }] },
        annotationRefs: [{ id: "f1", setId }],
      }),
    );

    expect(document.querySelector("[data-image-popup]")).not.toBeNull();
    expect(
      screen.getByRole("dialog", { name: "Image details at the clicked point" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close popup" })).toBeInTheDocument();
  });

  test("does not render another panel's popup", () => {
    const { openPopup } = setup();
    openPopup([]);

    // Re-open for panel 1 — panel 0's layer must stay empty.
    act(() =>
      currentStore.getState().openPopup({
        panelId: 1,
        anchor: { x: 0, y: 0 },
        sections: { Annotations: [{ type: "Annotations", values: {} }] },
        annotationRefs: [],
      }),
    );
    void openPopup;

    expect(document.querySelector("[data-image-popup]")).toBeNull();
  });

  test("a deleted referenced feature closes the popup", () => {
    const { store, setId, openPopup } = setup();
    const f1 = makeFeature("f1");
    store.getState().updateSetFeatures(setId, [f1]);
    openPopup([{ id: "f1", setId }]);
    expect(store.getState().popup).not.toBeNull();

    act(() => store.getState().updateSetFeatures(setId, []));

    expect(store.getState().popup).toBeNull();
  });

  test("a now-hidden referenced feature closes the popup", () => {
    const { store, setId, openPopup } = setup();
    const f1 = makeFeature("f1", "Tumor");
    store.getState().updateSetFeatures(setId, [f1]);
    openPopup([{ id: "f1", setId }]);
    expect(store.getState().popup).not.toBeNull();

    act(() => store.getState().toggleAnnotationClassVisibility(setId, "Tumor"));

    expect(store.getState().popup).toBeNull();
  });

  test("hiding the whole set closes the popup", () => {
    const { store, setId, openPopup } = setup();
    const f1 = makeFeature("f1", "Tumor");
    store.getState().updateSetFeatures(setId, [f1]);
    openPopup([{ id: "f1", setId }]);
    expect(store.getState().popup).not.toBeNull();

    // Set-level visibility funnels through hiddenClasses (every class hidden).
    act(() => store.getState().setAnnotationSetHidden(setId, true));

    expect(store.getState().popup).toBeNull();
  });

  test("close button dismisses the popup", () => {
    const { store, openPopup } = setup();
    openPopup([]);

    act(() => screen.getByRole("button", { name: "Close popup" }).click());

    expect(store.getState().popup).toBeNull();
  });
});
