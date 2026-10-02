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
