import { act, renderHook } from "@testing-library/react";

import { createViewerStore } from "../../../../state/store/createViewerStore";
import { TILE_REQUEST_DEBOUNCE_MS, useChannelsLayer } from "../useChannelsLayer";

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
    SIGNAL_ABORTED: "__vivSignalAborted",
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

/** Seeds `count` channels, all initialized, with `visibleIndexes` visible. */
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

  test("hidden channels get no selection, so their tiles are never fetched", () => {
    const { result } = renderHook(() => useChannelsLayer(0));
    const props = (result.current.layers[0] as { props: Record<string, unknown> }).props;

    // C is initialized but hidden.
    expect(props.selections).toEqual([
      { c: 0, x: 0, y: 0, z: 0, t: 0 },
      { c: 1, x: 0, y: 0, z: 0, t: 0 },
    ]);
    expect(props.channelsVisible).toEqual([true, true]);
  });

  test("a visibility-off change drops the channel from selections", () => {
    const { result, rerender } = renderHook(() => useChannelsLayer(0));
    const before = selectionsFromLayer(result.current.layers)!.props.selections;

    act(() => {
      store.setState((state) => {
        state.layersStates[0].channels.B.isVisible = false;
      });
    });
    rerender();

    const after = selectionsFromLayer(result.current.layers)!.props.selections;
    expect(after).not.toBe(before);
    expect(after).toEqual([{ c: 0, x: 0, y: 0, z: 0, t: 0 }]);
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

  test("contrast and color edits stay live while selections hold", () => {
    const { result, rerender } = renderHook(() => useChannelsLayer(0));
    const layerProps = () => (result.current.layers[0] as { props: Record<string, unknown> }).props;
    const before = layerProps().selections;

    act(() => {
      store.setState((state) => {
        state.layersStates[0].channels.A.contrastLimits = [5, 120];
        state.layersStates[0].channels.A.color = [9, 9, 9];
      });
    });
    rerender();

    const props = layerProps();
    expect(props.selections).toBe(before);
    expect(props.contrastLimits).toEqual([
      [5, 120],
      [0, 255],
    ]);
    expect(props.colors).toEqual([
      [9, 9, 9],
      [0, 255, 0],
    ]);
  });

  test("turning a channel on rebuilds selections with it", () => {
    const { result, rerender } = renderHook(() => useChannelsLayer(0));
    const before = selectionsFromLayer(result.current.layers)!.props.selections;

    act(() => {
      store.setState((state) => {
        state.layersStates[0].channels.C.isVisible = true;
      });
    });
    rerender();

    const after = selectionsFromLayer(result.current.layers)!.props.selections;
    expect(after).not.toBe(before);
    expect(after).toHaveLength(3);
  });

  test("visible channels beyond the viv cap wait, in image order", () => {
    seedManyChannels(12, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const { result } = renderHook(() => useChannelsLayer(0));
    const layerProps = () => (result.current.layers[0] as { props: Record<string, unknown> }).props;

    const selections = layerProps().selections as { c: number }[];
    expect(selections.map((selection) => selection.c)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(layerProps().channelsVisible).toEqual(Array(10).fill(true));
  });

  test("selections stay identity-stable for contrast and color edits with many channels", () => {
    // The perf win the memo exists for: an edit that does not change the
    // admitted set must not rebuild the selections array (deck.gl would
    // reloadAll every visible tile).
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

    expect(props.selections).toHaveLength(2);
    expect(props.channelsVisible).toEqual([true, true]);
  });

  test("tile requests wait for the viewport to settle", () => {
    const { result } = renderHook(() => useChannelsLayer(0));
    const props = (result.current.layers[0] as { props: Record<string, unknown> }).props;

    expect(TILE_REQUEST_DEBOUNCE_MS).toBeGreaterThan(0);
    expect(props.debounceTime).toBe(TILE_REQUEST_DEBOUNCE_MS);
  });

  test("a caller-aborted tile rejects with viv's SIGNAL_ABORTED sentinel", async () => {
    // deck.gl aborts in-flight tiles on every viewport change and treats a
    // getTileData rejection as TERMINAL (never re-requested — the tile parks
    // at its blurry parent level after a rapid zoom). The cancellable
    // protocol is viv's SIGNAL_ABORTED sentinel: the wrapper rethrows it and
    // the composite getTileData catches it and resolves null, which deck.gl
    // marks as cancelled and refinable. A plain null return would not work —
    // the composite dereferences it in tiles.map((d) => d.data).
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

    await expect(wrappedLoader.getTile({ x: 0, y: 0, selection: { c: 0, z: 0 } })).rejects.toBe(
      "__vivSignalAborted",
    );
  });

  test("a plain-Error abort also converts to the sentinel", async () => {
    // Some loaders signal aborts with a non-DOMException Error carrying
    // name "AbortError" (older plugin loaders); both shapes must convert.
    const abortingLoader = {
      ...loaderLevel,
      getTile: () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      },
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

    await expect(wrappedLoader.getTile({ x: 0, y: 0, selection: { c: 0, z: 0 } })).rejects.toBe(
      "__vivSignalAborted",
    );
  });

  test("a transient tile error is retried once before rejecting", async () => {
    // deck.gl treats a getTileData rejection as terminal (content = null, never
    // re-requested), so a single transient read error — an S3 5xx/429, a
    // network blip, a SigV4 hiccup — would strand the tile at its parent
    // (blurry) level with no retry anywhere. The wrapper retries once.
    let calls = 0;
    const flakyLoader = {
      ...loaderLevel,
      getTile: () => {
        calls += 1;
        if (calls === 1) return Promise.reject(new Error("transient S3 503"));
        return Promise.resolve({ data: new Uint8Array(16), width: 4, height: 4 });
      },
    };
    act(() => {
      store.setState({ loader: [flakyLoader] });
    });
    const { result } = renderHook(() => useChannelsLayer(0));

    const wrappedLoader = (
      result.current.layers[0] as unknown as {
        props: { loader: { getTile: (p: unknown) => Promise<unknown> }[] };
      }
    ).props.loader[0];

    const tile = await wrappedLoader.getTile({ x: 0, y: 0, selection: { c: 0, z: 0 } });
    expect(tile).toMatchObject({ width: 4, height: 4 });
    expect(calls).toBe(2);
  });

  test("a persistent tile error rejects after exactly one retry", async () => {
    let calls = 0;
    const alwaysFailingLoader = {
      ...loaderLevel,
      getTile: () => {
        calls += 1;
        return Promise.reject(new Error("persistent failure"));
      },
    };
    act(() => {
      store.setState({ loader: [alwaysFailingLoader] });
    });
    const { result } = renderHook(() => useChannelsLayer(0));

    const wrappedLoader = (
      result.current.layers[0] as unknown as {
        props: { loader: { getTile: (p: unknown) => Promise<unknown> }[] };
      }
    ).props.loader[0];

    await expect(wrappedLoader.getTile({ x: 0, y: 0, selection: { c: 0, z: 0 } })).rejects.toThrow(
      "persistent failure",
    );
    expect(calls).toBe(2);
  });

  test("abandoning a tile aborts the loader's read", async () => {
    const controller = new AbortController();
    let seenSignal: AbortSignal | undefined;
    const pendingLoader = {
      ...loaderLevel,
      getTile: (request: { signal?: AbortSignal }) => {
        seenSignal = request.signal;
        return new Promise<Awaited<ReturnType<typeof loaderLevel.getTile>>>(() => {});
      },
    };
    act(() => {
      store.setState({ loader: [pendingLoader] });
    });
    const { result } = renderHook(() => useChannelsLayer(0));

    const wrappedLoader = (
      result.current.layers[0] as unknown as {
        props: { loader: { getTile: (p: unknown) => Promise<unknown> }[] };
      }
    ).props.loader[0];

    const tile = wrappedLoader.getTile({
      x: 0,
      y: 0,
      selection: { c: 0, z: 0 },
      signal: controller.signal,
    });
    expect(seenSignal?.aborted).toBe(false);

    controller.abort();

    await expect(tile).rejects.toBe("__vivSignalAborted");
    expect(seenSignal?.aborted).toBe(true);
  });

  test("viv's own abort sentinel is not retried", async () => {
    let calls = 0;
    const sentinelLoader = {
      ...loaderLevel,
      getTile: () => {
        calls += 1;
        return Promise.reject("__vivSignalAborted");
      },
    };
    act(() => {
      store.setState({ loader: [sentinelLoader] });
    });
    const { result } = renderHook(() => useChannelsLayer(0));

    const wrappedLoader = (
      result.current.layers[0] as unknown as {
        props: { loader: { getTile: (p: unknown) => Promise<unknown> }[] };
      }
    ).props.loader[0];

    await expect(wrappedLoader.getTile({ x: 0, y: 0, selection: { c: 0, z: 0 } })).rejects.toBe(
      "__vivSignalAborted",
    );
    expect(calls).toBe(1);
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

  test("pixel readouts pair each visible channel with its own selection's value", () => {
    seedChannels(true); // A hidden, B visible, C hidden — columns [B]
    const { result } = renderHook(() => useChannelsLayer(0));

    // hoverData maps over selections, which hold only B.
    const items = result.current.getTooltipItems({} as never);

    expect(items).toEqual([
      {
        type: "Channels",
        values: {
          B: { value: "11", color: [0, 255, 0] },
        },
      },
    ]);

    // The store readout (sidebar) must carry the same aligned pair.
    expect(store.getState().pixelValues).toEqual({ B: 11 });
  });
});
