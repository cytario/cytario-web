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
let renderedPanelId: number | undefined;
let renderedTileRequestDebounceMs: number | undefined;

vi.mock("../../canvas/useViewerLayers", () => ({
  useViewerLayers: (
    panelId: number,
    _interactive?: boolean,
    _exclude?: string | null,
    tileObserver?: TileReadinessObserver,
    tileRequestDebounceMs?: number,
  ) => {
    renderedPanelId = panelId;
    renderedTileRequestDebounceMs = tileRequestDebounceMs;
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

const fakeDeck = () => ({
  isInitialized: true,
  getCanvas: () => document.createElement("canvas"),
  layerManager: { getLayers: () => tiledLayers },
});

/** The tiled layer deck holds, as the deck reports it. `layers` per tile are the
 *  tile sublayers that actually draw the pixels. */
let tiledLayers: { state: { tileset: unknown } }[] = [];

const tilesetWith = (tileCount: number, builtPerTile = 1, loaded = true) => [
  {
    state: {
      tileset: {
        isLoaded: loaded,
        selectedTiles: Array.from({ length: tileCount }, () => ({
          layers: Array.from({ length: builtPerTile }, () => ({})),
        })),
      },
    },
  },
];

type DeckProps = { layers: unknown[] };

const lastDeckProps = (): DeckProps => deckRender.mock.calls.at(-1)?.[0] as DeckProps;

const renderDeck = (imagePanelId = 0) => {
  const onSettled = vi.fn();
  const onFailed = vi.fn();
  const view = render(
    <CaptureDeck
      imagePanelId={imagePanelId}
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
  tiledLayers = [];
});

describe("CaptureDeck readiness", () => {
  test("renders the layers of the panel it is given, not the live active panel", () => {
    renderDeck(1);
    expect(renderedPanelId).toBe(1);
  });

  test("requests tiles without waiting for a settle, since the framed view never moves", () => {
    renderDeck(1);
    expect(renderedTileRequestDebounceMs).toBe(0);
  });

  test("does not mount the layers in the deck's first commit", async () => {
    renderDeck();
    // A layer created in the same commit as the deck can select tiles against
    // a viewport the canvas has not been measured for yet.
    expect(lastDeckProps().layers).toEqual([]);

    await mountLayers();
    expect(lastDeckProps().layers).toEqual(layerInstances);
  });

  test("does not read the canvas before a frame is drawn", async () => {
    const { onSettled } = renderDeck();
    await mountLayers();
    tiledLayers = tilesetWith(6);

    expect(onSettled).not.toHaveBeenCalled();
  });

  test("delivers the canvas on the first frame drawn with every tile built", async () => {
    const { onSettled, onFailed } = renderDeck();
    await mountLayers();
    tiledLayers = tilesetWith(6);

    drawFrame();

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled.mock.calls[0][0]).toBeInstanceOf(HTMLCanvasElement);
    expect(onFailed).not.toHaveBeenCalled();
  });

  test("delivers from a warm cache whose tileset is loaded on the first frame", async () => {
    const { onSettled, onFailed } = renderDeck();
    await mountLayers();

    tiledLayers = tilesetWith(9);
    drawFrame();

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onFailed).not.toHaveBeenCalled();
  });

  test("does not settle while the tiles have no sublayers yet", async () => {
    const { onSettled } = renderDeck();
    await mountLayers();

    // Tiles loaded but nothing built to draw them: settling here is the blank
    // export — the canvas holds no tissue.
    tiledLayers = tilesetWith(9, 0);
    drawFrame();

    expect(onSettled).not.toHaveBeenCalled();
  });

  test("does not deliver from a render that precedes any selected tiles", async () => {
    const { onSettled } = renderDeck();
    await mountLayers();

    drawFrame();
    expect(onSettled).not.toHaveBeenCalled();

    tiledLayers = tilesetWith(6);
    drawFrame();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  test("fails instead of settling when no tile exists for the framed extent", async () => {
    const { onSettled, onFailed } = renderDeck();
    await mountLayers();

    // An empty selection means the region lies off the slide — a machinery
    // fact. Tiles that exist but hold zeros are NOT this case: that is what an
    // empty corner of a slide looks like, and only the user can judge it.
    tiledLayers = tilesetWith(0);
    drawFrame();

    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onFailed.mock.calls[0][0]).toMatch(/outside the scanned region/i);
    expect(onSettled).not.toHaveBeenCalled();
  });

  test("does not fail while the selected tiles are still loading", async () => {
    const { onSettled, onFailed } = renderDeck();
    await mountLayers();

    // Selected but not loaded yet: pending, not empty. Treating this as
    // "nothing here" failed real captures on their first frame.
    tiledLayers = tilesetWith(9, 0, false);
    drawFrame();

    expect(onFailed).not.toHaveBeenCalled();
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

  test("settles once even if further frames are drawn", async () => {
    const { onSettled } = renderDeck();
    await mountLayers();
    tiledLayers = tilesetWith(6);

    drawFrame();
    tiledLayers = tilesetWith(9);
    drawFrame();

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  test("a tile error after the settle does not fail a delivered capture", async () => {
    const { onSettled, onFailed } = renderDeck();
    await mountLayers();
    tiledLayers = tilesetWith(6);

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
