import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  createCanvasTestStore,
  makeFeature,
  viewerStoreContextMock,
  type StoreRef,
} from "../../__tests__/canvasTestStore";
import { ImagePopupLayer } from "../ImagePopupLayer";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

const storeRef = vi.hoisted(() => ({ current: undefined }) as { current: StoreRef["current"] });

vi.mock("../../../../state/store/core/ViewerStoreContext", () => viewerStoreContextMock(storeRef));

function setup() {
  const { store, setId } = createCanvasTestStore();
  storeRef.current = store;
  render(<ImagePopupLayer imagePanelId={0} />);
  const openPopup = (
    annotationRefs: { id: string; setId: string }[],
    overrides: Partial<Parameters<ReturnType<typeof store.getState>["openPopup"]>[0]> = {},
  ) =>
    act(() =>
      store.getState().openPopup({
        panelId: 0,
        anchor: { x: 0, y: 0 },
        sections: { Annotations: [{ type: "Annotations", values: {} }] },
        annotationRefs,
        ...overrides,
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

  test("offers a class-scoped Join button per same-class group and joins on click", () => {
    const { store, setId, openPopup } = setup();
    const region = (id: string): AnnotationFeature => ({
      ...makeFeature(id, "Tumor"),
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [5, 0],
            [5, 5],
            [0, 5],
            [0, 0],
          ],
        ],
      },
    });
    const f1 = region("f1");
    const f2 = region("f2");
    store.getState().updateSetFeatures(setId, [f1, f2]);
    openPopup(
      [
        { id: "f1", setId },
        { id: "f2", setId },
      ],
      {
        sections: {
          Annotations: [
            {
              type: "Annotations",
              values: { Tumor: { value: "", color: [255, 0, 0] } },
            },
          ],
        },
      },
    );

    const join = screen.getByRole("button", { name: "Join 2 Tumor annotations" });
    expect(join).toBeInTheDocument();

    fireEvent.click(join);

    // Popup closes imperatively; the store holds one merged feature.
    expect(store.getState().popup).toBeNull();
    const set = store.getState().annotationSets.find((s) => s.id === setId)!;
    expect(set.features).toHaveLength(1);
    expect(store.getState().annotationSelectedIds).toEqual([set.features[0].id]);
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
