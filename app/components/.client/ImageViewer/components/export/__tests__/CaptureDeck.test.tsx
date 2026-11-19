import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ViewState } from "../../../state/store/types";
import type { TileReadinessObserver } from "../../canvas/Channels/useChannelsLayer";
import { CaptureDeck } from "../CaptureDeck";

const viewState = {
  target: [512, 512],
  zoom: 0,
  width: 320,
  height: 240,
  rotationX: 0,
  rotationOrbit: 0,
  minRotationX: -90,
  maxRotationX: 90,
  minZoom: -1,
  maxZoom: 2,
  transitionDuration: 0,
} as unknown as ViewState;

const deckRender = vi.fn();
const afterRender = vi.fn();

vi.mock("@deck.gl/react", async () => {
  const React = await import("react");
  // React 19 passes `ref` as a regular prop to function components.
  function MockDeckGL({
    onAfterRender,
    ref,
    ...deckProps
  }: {
    onAfterRender?: () => void;
    ref?: React.Ref<unknown>;
    [key: string]: unknown;
  }) {
    React.useImperativeHandle(ref, () => ({ deck: fakeDeck() }));
    deckRender(deckProps);
    afterRender(onAfterRender);
    return React.createElement("div", { "data-testid": "deckgl" });
  }
  return { default: MockDeckGL };
});

const layerInstances: { isLoaded: boolean }[] = [];

// The observer the deck hands to the layer composition is how readiness now
// reaches the component: these tests drive it the way deck does.
let observer: TileReadinessObserver | undefined;

vi.mock("../../canvas/useViewerLayers", () => ({
  useViewerLayers: (
    _panelId: number,
    _interactive?: boolean,
    _exclude?: string | null,
    tileObserver?: TileReadinessObserver,
  ) => {
    if (tileObserver) observer = tileObserver;
    return {
      layers: layerInstances,
      effects: [],
      layerFilter: () => true,
    };
  },
}));

vi.mock("../scalePixelSizes", () => ({
  scalePixelSizes: (layer: object, scale: number) => ({ ...layer, scaledBy: scale }),
}));

vi.mock("../../canvas/useView", () => ({
  useView: () => ({ id: "detail" }),
}));

const storeState = () => ({
  imagePanelIndex: 0,
  activeImagePanelId: 0,
  imagePanels: [0],
  layersStates: [{ isChannelsLoading: 0, isOverlaysLoading: 0 }],
});

vi.mock("../../../state/store/core/ViewerStoreContext", () => ({
  useViewerStore: (selector: (state: unknown) => unknown) => selector(storeState()),
}));

const fakeDeck = () => ({
  isInitialized: true,
  getCanvas: () => document.createElement("canvas"),
});

type DeckProps = { layers: unknown[] };

const lastDeckProps = (): DeckProps => deckRender.mock.calls.at(-1)?.[0] as DeckProps;

const renderDeck = () => {
  const onSettled = vi.fn();
  const onFailed = vi.fn();
  const view = render(
    <CaptureDeck
      viewState={viewState}
      width={320}
      height={240}
      onSettled={onSettled}
      onFailed={onFailed}
    />,
  );
  return { view, onSettled, onFailed };
};

/** The layer joins one frame after the deck, so the viewport is measured. */
const mountLayers = async () => {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
};

/** Runs deck's draw-pass callback, the way its render loop does each frame. */
const drawFrame = () => {
  const callback = afterRender.mock.calls.at(-1)?.[0] as (() => void) | undefined;
  act(() => callback?.());
};

beforeEach(() => {
  vi.clearAllMocks();
  observer = undefined;
  layerInstances.length = 0;
});

describe("CaptureDeck readiness", () => {
  test("does not mount the layers in the deck's first commit", async () => {
    renderDeck();
    // A layer created in the same commit as the deck can select tiles against
    // a viewport the canvas has not been measured for yet.
    expect(lastDeckProps().layers).toEqual([]);

    await mountLayers();
    expect(lastDeckProps().layers).toEqual(layerInstances);
  });

  test("does not read the canvas on the load callback — deck has not drawn yet", async () => {
    const { onSettled } = renderDeck();
    await mountLayers();

    // onViewportLoad fires from the layer update, which deck runs *before* the
    // draw pass: the canvas still holds the previous frame at this point.
    act(() => observer?.onViewportLoad?.(6));

    expect(onSettled).not.toHaveBeenCalled();
  });

  test("delivers the canvas on the render that follows the load", async () => {
    const { onSettled, onFailed } = renderDeck();
    await mountLayers();

    act(() => observer?.onViewportLoad?.(6));
    drawFrame();

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled.mock.calls[0][0]).toBeInstanceOf(HTMLCanvasElement);
    expect(onFailed).not.toHaveBeenCalled();
  });

  test("does not deliver from a render that precedes the load", async () => {
    const { onSettled } = renderDeck();
    await mountLayers();

    drawFrame();
    expect(onSettled).not.toHaveBeenCalled();

    act(() => observer?.onViewportLoad?.(6));
    drawFrame();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  test("fails instead of settling when the viewport selected no tiles", async () => {
    const { onSettled, onFailed } = renderDeck();
    await mountLayers();

    // An empty selection shares `isLoaded === true` with a finished render:
    // the tile count is the only thing that separates them.
    act(() => observer?.onViewportLoad?.(0));
    drawFrame();

    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onFailed.mock.calls[0][0]).toMatch(/no image data/i);
    expect(onSettled).not.toHaveBeenCalled();
  });

  test("fails instead of settling when a tile could not be loaded", async () => {
    const { onSettled, onFailed } = renderDeck();
    await mountLayers();

    act(() => observer?.onTileError?.(new Error("HTTP 500")));

    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onFailed.mock.calls[0][0]).toMatch(/could not be loaded/i);
    expect(onSettled).not.toHaveBeenCalled();
  });

  test("settles once even if the tile layer reports further viewport loads", async () => {
    const { onSettled } = renderDeck();
    await mountLayers();

    act(() => observer?.onViewportLoad?.(6));
    drawFrame();
    act(() => observer?.onViewportLoad?.(9));
    drawFrame();

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  test("a tile error after the settle does not fail a delivered capture", async () => {
    const { onSettled, onFailed } = renderDeck();
    await mountLayers();

    act(() => observer?.onViewportLoad?.(6));
    drawFrame();
    act(() => observer?.onTileError?.(new Error("late")));

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onFailed).not.toHaveBeenCalled();
  });

  test("hands every deck the framed view state, not the viewer's", async () => {
    renderDeck();
    const props = lastDeckProps() as unknown as { viewState: { detail: ViewState } };
    expect(props.viewState.detail).toBe(viewState);
  });
});
