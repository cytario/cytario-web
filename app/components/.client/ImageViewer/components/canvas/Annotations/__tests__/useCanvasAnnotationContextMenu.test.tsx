import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useStore } from "zustand";

import { createViewerStore } from "../../../../state/store/createViewerStore";
import type { ViewerStore } from "../../../../state/store/types";
import { useCanvasAnnotationContextMenu } from "../useCanvasAnnotationContextMenu";
import { seedViewerConnection } from "~/utils/__tests__/__mocks__";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

let currentStore: ReturnType<typeof createViewerStore>;

vi.mock("../../../../state/store/core/ViewerStoreContext", () => ({
  useViewerStore: <T,>(selector: (state: ViewerStore) => T): T => useStore(currentStore, selector),
  useViewerStoreApi: () => currentStore,
}));

vi.mock("../../../../utils/useCanAnnotate", () => ({
  useCanAnnotate: () => true,
}));

const makeFeature = (id: string, className?: string): AnnotationFeature => ({
  type: "Feature",
  id,
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  },
  properties: {
    ...(className ? { classification: { name: className, color: [255, 0, 0] } } : {}),
  },
});

interface FakePick {
  layerId: string;
  feature: AnnotationFeature;
}

/** Deck stub whose picks can be swapped between right-clicks. */
function fakeDeckRef(picks: FakePick[]) {
  const ref = {
    current: {
      deck: {
        getCanvas: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }),
        pickMultipleObjects: vi.fn(() =>
          picks.map((p) => ({ layer: { id: p.layerId }, object: p.feature })),
        ),
      },
    },
  };
  return { ref, picks };
}

function Harness({ deckRef }: { deckRef: React.RefObject<never> }) {
  const { onCanvasContextMenu, menu } = useCanvasAnnotationContextMenu({ deckRef });
  return (
    <div onContextMenuCapture={onCanvasContextMenu}>
      <div data-testid="canvas" />
      {menu}
    </div>
  );
}

function setup() {
  seedViewerConnection("test-conn");
  const store = createViewerStore(`test-conn/images/slide-${Math.random()}.ome.tif`, "user-a");
  const setId = store.getState().ensureOwnSet();
  store.getState().setAnnotationMode("view");
  currentStore = store;

  const picks: FakePick[] = [];
  const { ref } = fakeDeckRef(picks);
  render(<Harness deckRef={ref as never} />);
  return {
    store,
    setId,
    picks,
    canvas: screen.getByTestId("canvas"),
    rightClick: () =>
      fireEvent.contextMenu(screen.getByTestId("canvas"), { clientX: 5, clientY: 5 }),
  };
}

describe("useCanvasAnnotationContextMenu", () => {
  test("right-click on a resolved pick opens the menu without throwing (real event)", () => {
    const feature = makeFeature("f1", "Tumor");
    const { setId, picks, rightClick, store } = setup();
    store.getState().updateSetFeatures(setId, [feature]);
    picks.push({ layerId: `annotations-0-polygons-fill`, feature });

    expect(() => rightClick()).not.toThrow();
    expect(screen.getByRole("menuitem", { name: "Zoom to annotation" })).toBeInTheDocument();
  });

  test("opens the full menu when the deck resolves an own-set annotation", () => {
    const feature = makeFeature("f1", "Tumor");
    const { setId, picks, rightClick, store } = setup();
    store.getState().updateSetFeatures(setId, [feature]);
    picks.push({ layerId: `annotations-0-polygons-fill`, feature });

    rightClick();

    expect(screen.getByRole("menuitem", { name: "Zoom to annotation" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Move to Tumor" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete annotation" })).toBeInTheDocument();
  });

  test("omits 'Clear classification' for an unclassified annotation, shows it for a classified one", () => {
    const unclassified = makeFeature("f1");
    const classified = makeFeature("f2", "Tumor");
    const { setId, picks, rightClick, store } = setup();
    store.getState().updateSetFeatures(setId, [unclassified, classified]);

    picks.push({ layerId: `annotations-0-polygons-fill`, feature: unclassified });
    rightClick();
    expect(
      screen.queryByRole("menuitem", { name: "Clear classification" }),
    ).not.toBeInTheDocument();

    picks.length = 0;
    picks.push({ layerId: `annotations-0-polygons-fill`, feature: classified });
    rightClick();
    expect(screen.getByRole("menuitem", { name: "Clear classification" })).toBeInTheDocument();
  });

  test("resolves a peer set by the set id contained in the sublayer id", () => {
    const own = makeFeature("f1");
    const peer = makeFeature("f2");
    const { store, setId, picks, rightClick } = setup();
    store.getState().updateSetFeatures(setId, [own]);
    store.getState().ensureOwnSet();
    const peerSetId = store.getState().annotationSets.at(-1)!.id;
    store.getState().updateSetFeatures(peerSetId, [peer]);
    picks.push({ layerId: `annotations-0-peer-${peerSetId}-polygons-fill`, feature: peer });

    rightClick();

    expect(screen.getByRole("menuitem", { name: "Zoom to annotation" })).toBeInTheDocument();
  });

  test("no picks leave the native menu in place (no menu items rendered)", () => {
    const { rightClick } = setup();

    rightClick();

    expect(screen.queryByRole("menu")).toBeNull();
  });
});
