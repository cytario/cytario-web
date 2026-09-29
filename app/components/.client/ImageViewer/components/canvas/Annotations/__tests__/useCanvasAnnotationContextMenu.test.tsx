import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  createCanvasTestStore,
  makeFeature,
  viewerStoreContextMock,
  type StoreRef,
} from "../../__tests__/canvasTestStore";
import { useCanvasAnnotationContextMenu } from "../useCanvasAnnotationContextMenu";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

const storeRef = vi.hoisted(() => ({ current: undefined }) as { current: StoreRef["current"] });

vi.mock("../../../../state/store/core/ViewerStoreContext", () => viewerStoreContextMock(storeRef));

vi.mock("../../../../utils/useCanAnnotate", () => ({
  useCanAnnotate: () => true,
}));

/** Harness rendering the menu body so tests can assert on its items. */
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
  const { store, setId } = createCanvasTestStore();
  storeRef.current = store;

  const picks: { layerId: string; feature: AnnotationFeature }[] = [];
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
    store.getState().seedAnnotations([
      {
        id: "aaaa1111-bbbb-4ccc-8ddd-eeeeffff0000",
        createdBy: "user-b",
        features: [peer],
        name: "peer.json",
      },
    ]);
    picks.push({
      layerId: `annotations-0-peer-aaaa1111-bbbb-4ccc-8ddd-eeeeffff0000-polygons-fill`,
      feature: peer,
    });

    rightClick();

    expect(screen.getByRole("menuitem", { name: "Zoom to annotation" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete annotation" })).toBeInTheDocument();
  });

  test("a hidden-class region opens no menu (and suppresses the native one)", () => {
    const feature = makeFeature("f1", "Tumor");
    const { store, setId, picks, rightClick } = setup();
    store.getState().updateSetFeatures(setId, [feature]);
    store.getState().toggleAnnotationClassVisibility(setId, "Tumor");
    picks.push({ layerId: `annotations-0-polygons-fill`, feature });

    expect(rightClick()).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("a right-click miss suppresses the native menu and opens nothing", () => {
    const { rightClick } = setup();

    expect(rightClick()).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
