import { act, renderHook } from "@testing-library/react";

import { createViewerStore } from "../../../../state/store/createViewerStore";
import { useChannelsLayer } from "../useChannelsLayer";

let store: ReturnType<typeof createViewerStore>;

vi.mock("../../../../state/store/core/ViewerStoreContext", () => ({
  useViewerStore: (selector: (s: unknown) => unknown) => selector(store.getState()),
}));

vi.mock("../../../../utils/useTilesLoading", () => ({
  useTilesLoading: () => ({ loadTile: vi.fn(), finishTile: vi.fn() }),
}));

vi.mock("../../../../utils/handleImageViewerHover", () => ({
  handleImageViewerHover: () => ({
    hoverData: [11, 22, 33],
    coordinate: [0, 0],
  }),
}));

vi.mock("@hms-dbmi/viv", () => {
  class MultiscaleImageLayer {
    props: Record<string, unknown>;
    constructor(props: Record<string, unknown>) {
      this.props = props;
    }
  }
  class ColorPaletteExtension {}
  return {
    MultiscaleImageLayer,
    ColorPaletteExtension,
    MAX_CHANNELS: 10,
  };
});

const loaderLevel = {
  shape: [1, 1, 4, 4] as number[],
  dtype: "Uint8" as const,
  labels: ["t", "c", "y", "x"] as string[],
  tileSize: 256,
  getTile: async () => ({ data: new Uint8Array(16), width: 4, height: 4 }),
  getRaster: async () => ({ data: new Uint8Array(16), width: 4, height: 4 }),
};

/**
 * Seeds 4 channels with the first 3 initialized; `hiddenFirst` makes the
 * first initialized channel hidden so a visible channel is preceded by a
 * hidden one — the case where the column index and the visible index diverge.
 */
const seedChannels = (hiddenFirst = false) => {
  store.setState({
    loader: [loaderLevel],
    metadata: { Pixels: { Type: "Uint8" } } as never,
    channelIds: ["A", "B", "C", "D"],
    channels: Object.fromEntries(
      ["A", "B", "C", "D"].map((id, index) => [
        id,
        {
          selection: { c: index, x: 0, y: 0, z: 0, t: 0 },
          domain: [0, 255] as [number, number],
          histogram: new Array(256).fill(0),
          isInitialized: index < 3,
          isLoading: false,
          isVisible: hiddenFirst ? index === 1 : index < 2,
          contrastLimits: [0, 255] as [number, number],
          color: [255, 0, 0] as [number, number, number],
        },
      ]),
    ),
    imagePanels: [0],
    imagePanelIndex: 0,
    layersStates: [
      {
        id: "view-1",
        author: "",
        shared: false,
        channels: {
          A: { isVisible: !hiddenFirst, contrastLimits: [0, 255], color: [255, 0, 0] },
          B: { isVisible: true, contrastLimits: [0, 255], color: [0, 255, 0] },
          C: { isVisible: false, contrastLimits: [0, 255], color: [0, 0, 255] },
        },
        overlays: {},
        channelsOpacity: 1,
        overlaysFillOpacity: 0.8,
        showCellOutline: true,
        annotationsOpacity: 0.5,
        showAnnotationOutline: true,
        isChannelsLoading: 0,
        isOverlaysLoading: 0,
      },
    ],
  });
};

const selectionsFromLayer = (layers: unknown[]): { props: { selections: unknown[] } } | undefined =>
  (layers[0] as { props: { selections: unknown[] } } | undefined) ?? undefined;

/**
 * Seeds `count` channels, all initialized, with `visibleIndexes` visible —
 * the >MAX_CHANNELS regime where the admission cap reshuffles on toggles.
 */
const seedManyChannels = (count: number, visibleIndexes: number[]) => {
  const ids = Array.from({ length: count }, (_, index) => `Ch${index}`);
  const visibleSet = new Set(visibleIndexes);
  store.setState({
    loader: [loaderLevel],
    metadata: { Pixels: { Type: "Uint8" } } as never,
    channelIds: ids,
    channels: Object.fromEntries(
      ids.map((id, index) => [
        id,
        {
          selection: { c: index, x: 0, y: 0, z: 0, t: 0 },
          domain: [0, 255] as [number, number],
          histogram: new Array(256).fill(0),
          isInitialized: true,
          isLoading: false,
          isVisible: visibleSet.has(index),
          contrastLimits: [0, 255] as [number, number],
          color: [(index * 23) % 256, (index * 17) % 256, (index * 11) % 256] as [
            number,
            number,
            number,
          ],
        },
      ]),
    ),
    imagePanels: [0],
    imagePanelIndex: 0,
    layersStates: [
      {
        id: "view-1",
        author: "",
        shared: false,
        channels: Object.fromEntries(
          ids.map((id, index) => [
            id,
            {
              isVisible: visibleSet.has(index),
              contrastLimits: [0, 255] as [number, number],
              color: [(index * 23) % 256, (index * 17) % 256, (index * 11) % 256] as [
                number,
                number,
                number,
              ],
            },
          ]),
        ),
        overlays: {},
        channelsOpacity: 1,
        overlaysFillOpacity: 0.8,
        showCellOutline: true,
        annotationsOpacity: 0.5,
        showAnnotationOutline: true,
        isChannelsLoading: 0,
        isOverlaysLoading: 0,
      },
    ],
  });
  return ids;
};

describe("useChannelsLayer selections stability", () => {
  beforeEach(() => {
    store = createViewerStore("test-conn/images/stability.ome.tif", "");
    seedChannels();
  });

  test("selections identity is stable across a contrastLimits change", () => {
    const { result, rerender } = renderHook(() => useChannelsLayer(0));
    const before = selectionsFromLayer(result.current.layers)!.props.selections;

    act(() => {
      store.setState((state) => {
        state.layersStates[0].channels.A.contrastLimits = [10, 200];
      });
    });
    rerender();

    const after = selectionsFromLayer(result.current.layers)!.props.selections;
    expect(after).toBe(before);
  });

  test("selections identity is stable across a visibility-off change", () => {
    const { result, rerender } = renderHook(() => useChannelsLayer(0));
    const before = selectionsFromLayer(result.current.layers)!.props.selections;

    act(() => {
      store.setState((state) => {
        state.layersStates[0].channels.B.isVisible = false;
      });
    });
    rerender();

    const after = selectionsFromLayer(result.current.layers)!.props.selections;
    expect(after).toBe(before);
  });

  test("selections identity is stable across a color change", () => {
    const { result, rerender } = renderHook(() => useChannelsLayer(0));
    const before = selectionsFromLayer(result.current.layers)!.props.selections;

    act(() => {
      store.setState((state) => {
        state.layersStates[0].channels.A.color = [0, 128, 255];
      });
    });
    rerender();

    const after = selectionsFromLayer(result.current.layers)!.props.selections;
    expect(after).toBe(before);
  });

  test("contrast, color and visibility edits stay live while selections hold", () => {
    const { result, rerender } = renderHook(() => useChannelsLayer(0));
    const layerProps = () => (result.current.layers[0] as { props: Record<string, unknown> }).props;

    expect(layerProps().channelsVisible).toEqual([true, true, false]);

    act(() => {
      store.setState((state) => {
        state.layersStates[0].channels.B.isVisible = false;
        state.layersStates[0].channels.A.contrastLimits = [5, 120];
        state.layersStates[0].channels.A.color = [9, 9, 9];
      });
    });
    rerender();

    const props = layerProps();
    expect(props.selections).toHaveLength(3);
    expect(props.channelsVisible).toEqual([true, false, false]);
    expect(props.contrastLimits).toEqual([
      [5, 120],
      [0, 255],
      [0, 255],
    ]);
    expect(props.colors).toEqual([
      [9, 9, 9],
      [0, 255, 0],
      [0, 0, 255],
    ]);
  });

  test("adding a channel to the initialized set rebuilds selections", () => {
    const { result, rerender } = renderHook(() => useChannelsLayer(0));
    const before = selectionsFromLayer(result.current.layers)!.props.selections;

    act(() => {
      store.setState((state) => {
        state.channels.D.isInitialized = true;
        state.layersStates[0].channels.D = {
          isVisible: false,
          contrastLimits: [0, 255],
          color: [255, 255, 0],
        };
      });
    });
    rerender();

    const after = selectionsFromLayer(result.current.layers)!.props.selections;
    expect(after).not.toBe(before);
    expect(after).toHaveLength(4);
  });

  test("selections follow the admission cap when a toggle ON evicts a hidden fill channel", () => {
    // 12 initialized channels, 9 visible: before the toggle the cap admits the
    // 9 visible plus one hidden fill (Ch9). Toggling Ch11 on makes 10 visible
    // and drops the fill — the admitted set changes, so selections must be
    // rebuilt to keep index pairing with the fresh colors/channelsVisible
    // columns. With the old renderable-set key this transition kept the stale
    // array and rendered Ch9's plane in Ch11's color.
    seedManyChannels(12, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const { result, rerender } = renderHook(() => useChannelsLayer(0));
    const layerProps = () => (result.current.layers[0] as { props: Record<string, unknown> }).props;

    expect(layerProps().selections).toHaveLength(10);
    expect((layerProps().selections as { c: number }[])[9].c).toBe(9);

    act(() => {
      store.setState((state) => {
        state.layersStates[0].channels.Ch11.isVisible = true;
      });
    });
    rerender();

    const selections = layerProps().selections as { c: number }[];
    expect(selections).toHaveLength(10);
    expect(selections[9].c).toBe(11);
    expect(layerProps().channelsVisible).toEqual([...Array(9).fill(true), true]);
  });

  test("selections follow the admission cap when a toggle OFF admits an earlier hidden channel", () => {
    // All 12 initialized, channels 2–11 visible (10 — cap full). Toggling Ch2
    // off frees one hidden slot and the first hidden renderable in image
    // order (Ch0) takes it, shifting the admitted set: selections[0] must now
    // carry Ch0's plane paired with the fresh columns, not keep Ch2's.
    seedManyChannels(12, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const { result, rerender } = renderHook(() => useChannelsLayer(0));
    const layerProps = () => (result.current.layers[0] as { props: Record<string, unknown> }).props;

    expect((layerProps().selections as { c: number }[])[0].c).toBe(2);

    act(() => {
      store.setState((state) => {
        state.layersStates[0].channels.Ch2.isVisible = false;
      });
    });
    rerender();

    const selections = layerProps().selections as { c: number }[];
    const channelsVisible = layerProps().channelsVisible as boolean[];
    expect(selections).toHaveLength(10);
    expect(selections[0].c).toBe(0);
    expect(channelsVisible[0]).toBe(false);
    expect(selections.map((selection) => selection.c)).toEqual([0, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  test("selections stay identity-stable for contrast and color edits beyond the cap", () => {
    // The perf win the memo exists for: with more renderable channels than the
    // cap, an edit that does not change the admitted set must not rebuild the
    // selections array (deck.gl would reloadAll every visible tile).
    seedManyChannels(12, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const { result, rerender } = renderHook(() => useChannelsLayer(0));
    const before = selectionsFromLayer(result.current.layers)!.props.selections;

    act(() => {
      store.setState((state) => {
        state.layersStates[0].channels.Ch0.contrastLimits = [10, 200];
        state.layersStates[0].channels.Ch1.color = [9, 9, 9];
      });
    });
    rerender();

    const after = selectionsFromLayer(result.current.layers)!.props.selections;
    expect(after).toBe(before);
  });

  test("a channel turned on before its stats resolve still receives a selection", () => {
    // The preset-switch regression: B is checked on but its initChannelStats
    // fetch has not resolved (isInitialized false). It must stay in selections —
    // rendered with default contrast — instead of vanishing from the canvas
    // while its checkbox is on.
    act(() => {
      store.setState((state) => {
        state.channels.B.isInitialized = false;
        state.channels.B.isLoading = true;
      });
    });
    const { result } = renderHook(() => useChannelsLayer(0));
    const props = (result.current.layers[0] as { props: Record<string, unknown> }).props;

    expect(props.selections).toHaveLength(3);
    expect(props.channelsVisible).toEqual([true, true, false]);
  });

  test("a caller-aborted tile resolves to null instead of rejecting", async () => {
    // deck.gl aborts in-flight tiles on every viewport change and treats a
    // getTile rejection as TERMINAL (content = null, _isLoaded = true, never
    // re-requested) — the tile would stay parked at its parent (blurry)
    // level after a rapid zoom. The wrapper must convert AbortError to a
    // null return, matching viv's own SIGNAL_ABORTED protocol, so deck.gl
    // marks the tile as cancelled and refinable.
    const abortingLoader = {
      ...loaderLevel,
      getTile: () => Promise.reject(new DOMException("aborted", "AbortError")),
    };
    act(() => {
      store.setState({ loader: [abortingLoader] });
    });
    const { result } = renderHook(() => useChannelsLayer(0));

    const wrappedLoader = (
      result.current.layers[0] as unknown as {
        props: { loader: { getTile: (p: unknown) => Promise<unknown> }[] };
      }
    ).props.loader[0];

    await expect(
      wrappedLoader.getTile({ x: 0, y: 0, selection: { c: 0, z: 0 } }),
    ).resolves.toBeNull();
  });

  test("a non-abort tile error still rejects", async () => {
    const failingLoader = {
      ...loaderLevel,
      getTile: () => Promise.reject(new Error("genuine tile failure")),
    };
    act(() => {
      store.setState({ loader: [failingLoader] });
    });
    const { result } = renderHook(() => useChannelsLayer(0));

    const wrappedLoader = (
      result.current.layers[0] as unknown as {
        props: { loader: { getTile: (p: unknown) => Promise<unknown> }[] };
      }
    ).props.loader[0];

    await expect(wrappedLoader.getTile({ x: 0, y: 0, selection: { c: 0, z: 0 } })).rejects.toThrow(
      "genuine tile failure",
    );
  });

  test("pixel readouts exclude hidden channels", () => {
    const { result } = renderHook(() => useChannelsLayer(0));
    const getTooltipItems = result.current.getTooltipItems;

    const items = getTooltipItems({} as never);

    // Channel C is initialized but hidden — it must not surface a readout.
    expect(items).toEqual([
      {
        type: "Channels",
        values: {
          A: { value: "11", color: [255, 0, 0] },
          B: { value: "22", color: [0, 255, 0] },
        },
      },
    ]);
  });

  test("pixel readouts keep channel-value alignment when a hidden channel precedes a visible one", () => {
    seedChannels(true); // A hidden, B visible, C hidden — columns [A, B, C]
    const { result } = renderHook(() => useChannelsLayer(0));

    // hoverData maps over selections (all three initialized channels): B's
    // intensity lives at index 1, not at its visible-position index 0.
    const items = result.current.getTooltipItems({} as never);

    expect(items).toEqual([
      {
        type: "Channels",
        values: {
          B: { value: "22", color: [0, 255, 0] },
        },
      },
    ]);

    // The store readout (sidebar) must carry the same aligned pair.
    expect(store.getState().pixelValues).toEqual({ B: 22 });
  });
});
