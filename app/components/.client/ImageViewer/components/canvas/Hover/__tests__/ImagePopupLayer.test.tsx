import { act, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  createCanvasTestStore,
  makeFeature,
  viewerStoreContextMock,
  type StoreRef,
} from "../../__tests__/canvasTestStore";
import { ImagePopupLayer } from "../ImagePopupLayer";

const storeRef = vi.hoisted(() => ({ current: undefined }) as { current: StoreRef["current"] });

vi.mock("../../../../state/store/core/ViewerStoreContext", () => viewerStoreContextMock(storeRef));

function setup() {
  const { store, setId } = createCanvasTestStore();
  storeRef.current = store;
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
    const { store, setId, openPopup } = setup();
    store.getState().updateSetFeatures(setId, [makeFeature("f1")]);
    openPopup([{ id: "f1", setId }]);

    expect(document.querySelector("[data-image-popup]")).not.toBeNull();
    expect(
      screen.getByRole("dialog", { name: "Image details at the clicked point" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close popup" })).toBeInTheDocument();
  });

  test("does not render another panel's popup", () => {
    const { openPopup } = setup();
    act(() =>
      storeRef.current!.getState().openPopup({
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

    act(() =>
      document
        .querySelector('button[aria-label="Close popup"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );

    expect(store.getState().popup).toBeNull();
  });
});
