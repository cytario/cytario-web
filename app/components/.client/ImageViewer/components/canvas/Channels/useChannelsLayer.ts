import { PickingInfo } from "@deck.gl/core";
import { MultiscaleImageLayer, ColorPaletteExtension, SIGNAL_ABORTED } from "@hms-dbmi/viv";
import { useCallback, useMemo } from "react";

import { AbandonedTileAbortingTileset } from "./AbandonedTileAbortingTileset";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { channelsStateForPanel, select } from "../../../state/store/selectors";
import {
  type CytarioLayerResult,
  type ChannelsState,
  type LayerTooltipItem,
} from "../../../state/store/types";
import { handleImageViewerHover } from "../../../utils/handleImageViewerHover";
import { mapChannelConfigsToState } from "../../../utils/mapChannelConfigsToState";
import { getCachedTile } from "../../../utils/sharedTileCache";
import { useTilesLoading } from "../../../utils/useTilesLoading";

const EMPTY_OBJECT = Object.freeze({}) as ChannelsState;

/** How long the viewport must settle before deck.gl requests its tiles. */
export const TILE_REQUEST_DEBOUNCE_MS = 150;

/** Both abort shapes loaders use: DOMException (plugins, spec) and plain Error. */
const isAbortError = (error: unknown): boolean =>
  (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";

/** Whether the loader's own `onTileError` would swallow this error.
 *
 * `BoundsCheckError` is viv-internal and unexported, so it can only be matched
 * by name. A layer-level handler replaces the pixel source's, so without this
 * the out-of-image tiles of a region spilling past the slide edge would fail a
 * capture instead of rendering nothing, which is what viv does by default. */
const isExpectedTileError = (
  loaderLevel: { onTileError?: (error: Error) => void } | undefined,
  error: unknown,
): boolean => {
  if (!loaderLevel?.onTileError) return error instanceof Error && error.name === "BoundsCheckError";
  if (!(error instanceof Error)) return false;
  try {
    loaderLevel.onTileError(error);
    return true;
  } catch {
    return false;
  }
};

// `getTile` runs once per tile per channel per load — and again for each
// channel of a `best-available` refinement — so serializing `params.selection`
// inline re-stringified the same array on every fetch. The selection array is
// stable for a given layer state, so memoize its JSON form per instance; a new
// layer state hands a new array and the key is rebuilt.
const selectionKeyCache = new WeakMap<object, string>();
export const selectionKey = (selection: unknown): string => {
  if (typeof selection !== "object" || selection === null) return String(selection);
  const cached = selectionKeyCache.get(selection);
  if (cached !== undefined) return cached;
  const key = JSON.stringify(selection);
  selectionKeyCache.set(selection, key);
  return key;
};

type MultiscaleImageLayerProps = ConstructorParameters<typeof MultiscaleImageLayer>[0];

/** What a capture deck needs to know that the framed extent actually rendered. */
export interface TileReadinessObserver {
  /** Fired for a tile that failed after the retry — a capture must not settle
   *  on a frame with holes. */
  onTileError?: (error: unknown) => void;
}

export const useChannelsLayer = (
  imagePanelId: number,
  observer?: TileReadinessObserver,
  tileRequestDebounceMs = TILE_REQUEST_DEBOUNCE_MS,
): CytarioLayerResult<InstanceType<typeof MultiscaleImageLayer> | null> => {
  const dtype = useViewerStore((state) => {
    const type = state.metadata?.Pixels.Type ?? "Uint8";
    return type;
  });

  const channelsState = useViewerStore(channelsStateForPanel(imagePanelId)) ?? EMPTY_OBJECT;

  // Two memo layers below. viv keys its tile cache off the `selections` array
  // identity (deck.gl compares `updateTriggers.getTileData` shallowly), so a
  // fresh `selections` per edit would `reloadAll()` every visible tile. viv
  // applies contrast/colors/visibility as uniforms instead, so those columns
  // must stay fresh per edit while `selections` only changes when the set of
  // admitted (visible) channels — or a channel's selection values — changes.
  // `selections` pairs with colors/contrastLimits/channelsVisible by position.
  const columnsWithoutSelections = useMemo(
    () => mapChannelConfigsToState(channelsState),
    [channelsState],
  );

  const admittedSelectionsKey = useMemo(
    () =>
      columnsWithoutSelections.ids
        .map((id, index) => {
          const { c, x, y, z, t } = columnsWithoutSelections.selections[index];
          return `${id}:${c}:${x}:${y}:${z}:${t}`;
        })
        .join("\0"),
    [columnsWithoutSelections],
  );

  // The memo deliberately keys on the serialized admitted-selection state, not
  // on the columns' array identity — depending on the array would defeat the
  // memo (every store edit rebuilds it) and re-trigger deck.gl's reloadAll.
  const stableSelections = useMemo(
    () => columnsWithoutSelections.selections,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [admittedSelectionsKey],
  );

  const extensions = useMemo(() => [new ColorPaletteExtension()], []);

  const { ids, contrastLimits, colors, channelsVisible } = columnsWithoutSelections;
  const selections = stableSelections;

  const rawLoader = useViewerStore(select.loader);
  const setIsChannelsLoading = useViewerStore(select.setIsChannelsLoading);
  const setPixelValues = useViewerStore(select.setPixelValues);
  const { loadTile, finishTile } = useTilesLoading(imagePanelId, setIsChannelsLoading);
  const channelsOpacity = useViewerStore((state) => {
    const channelsStateIndex = state.imagePanels[imagePanelId];
    return state.layersStates[channelsStateIndex]?.channelsOpacity ?? 1;
  });

  const loader = useMemo(() => {
    if (!rawLoader || rawLoader.length === 0) return rawLoader;

    return rawLoader.map((loaderLevel, levelIndex) => {
      const originalGetTile = loaderLevel.getTile.bind(loaderLevel);
      // A level that has not opted in may share one request across tiles, so
      // one tile's abort would fail its neighbours: it gets no signal.
      const isAbortable = loaderLevel.supportsAbortableTileReads === true;

      const wrappedLoader = Object.create(Object.getPrototypeOf(loaderLevel));
      Object.assign(wrappedLoader, loaderLevel);

      wrappedLoader.getTile = async (params: Parameters<typeof originalGetTile>[0]) => {
        // The id must name one fetch, not one tile location: viv requests every
        // channel of a tile in parallel from this same function, so a key of
        // x/y alone collapses a 9-channel tile into one entry and the first
        // channel's finish clears the count while eight fetches are still in
        // flight. The level belongs in the key too — the live panel and the
        // capture deck load different levels for the same x/y.
        const { c, z, t } = params.selection ?? { c: 0, z: 0, t: 0 };
        const tileId = `${levelIndex}:${params.x}:${params.y}:${c}:${z}:${t}`;

        loadTile(tileId);

        // Shared across panels: a second ImagePanel's getTile resolves from memory
        // instead of refetching. Keyed by level + tile coords + full selection;
        // namespaced to rawLoader so an image switch drops the cache. signal is
        // intentionally excluded from the key.
        const cacheKey = `${levelIndex}:${params.x}:${params.y}:${selectionKey(params.selection)}`;
        // The loader sees the cache's shared signal, not deck.gl's: a fetch
        // another panel still waits for must not be aborted by this tile.
        const fetchTile = () =>
          getCachedTile(
            rawLoader,
            cacheKey,
            (sharedSignal) =>
              originalGetTile({ ...params, signal: isAbortable ? sharedSignal : undefined }),
            isAbortable ? params.signal : undefined,
          );

        // deck.gl treats a getTileData rejection as terminal (content = null,
        // never re-requested — the tile parks at its blurry parent level), so a
        // single transient read error (S3 5xx/429, network blip, SigV4 hiccup)
        // would strand the tile with no retry anywhere. Abort errors convert to
        // viv's SIGNAL_ABORTED sentinel (the composite getTileData catches it and
        // returns null, which deck.gl marks refinable — plugin loaders throw
        // DOMException AbortError, viv's own loaders throw the sentinel). One
        // retry covers transient failures of a tile still wanted; persistent
        // ones still reject, and an abandoned tile is never retried.
        try {
          const result = await fetchTile();
          finishTile(tileId);
          return result;
        } catch (error) {
          if (isAbortError(error) || error === SIGNAL_ABORTED || params.signal?.aborted) {
            finishTile(tileId);
            throw SIGNAL_ABORTED;
          }
          try {
            const retried = await fetchTile();
            finishTile(tileId);
            return retried;
          } catch (retryError) {
            finishTile(tileId);
            throw retryError;
          }
        }
      };

      return wrappedLoader as typeof rawLoader;
    });
  }, [finishTile, loadTile, rawLoader]);

  // Channel sublayers are pickable so the composite hover hook can find the
  // channels pick via `pickMultipleObjects`; the explicit id lets it identify this
  // layer. No per-layer `onHover` — the composite hook handles all hover orchestration.
  const multiscaleLayer = useMemo(() => {
    if (!loader || loader.length === 0) return null;

    return new MultiscaleImageLayer({
      id: `channels-${imagePanelId}`,
      loader,
      extensions,
      selections,
      contrastLimits,
      colors,
      channelsVisible,
      dtype,
      opacity: channelsOpacity,
      // viv defaults to `no-overlap` whenever opacity < 1, which shows blank
      // holes at the target level instead of the parent-level fallback while
      // new tiles load — visible as flicker across a zoom step. Pin
      // `best-available` so a partial-resolution image is always shown.
      refinementStrategy: "best-available",
      // Without a debounce every wheel step requests the tiles of each level it
      // passes through, and those fetches queue ahead of the final view's.
      debounceTime: tileRequestDebounceMs,
      // viv spreads its props into the inner TileLayer, which builds its tileset from this.
      TilesetClass: AbandonedTileAbortingTileset,
      pickable: true,
      onTileError: (error: unknown) => {
        if (isAbortError(error)) return;
        if (error === SIGNAL_ABORTED) return;
        if (error instanceof AggregateError && error.errors.every((e) => e?.name === "AbortError"))
          return;
        // Supplying a handler replaces viv's own (`onTileError || loader[0].onTileError`),
        // so reproduce its filter or a region spilling past the slide edge
        // would fail instead of rendering the empty edge tile as before.
        if (isExpectedTileError(rawLoader?.[0], error)) return;
        observer?.onTileError?.(error);
        console.error(error);
      },
    } as unknown as MultiscaleImageLayerProps);
  }, [
    observer,
    loader,
    rawLoader,
    extensions,
    selections,
    contrastLimits,
    colors,
    channelsVisible,
    dtype,
    channelsOpacity,
    imagePanelId,
    tileRequestDebounceMs,
  ]);

  const getTooltipItems = useCallback(
    (info: PickingInfo): LayerTooltipItem[] => {
      const data = handleImageViewerHover(info);
      if (!data) return [];

      // hoverData is indexed like the columns, which hold only visible channels.
      const { hoverData } = data;
      setPixelValues(
        ids,
        ids.map((_, index) => hoverData[index] ?? 0),
      );

      const valuesRecord: Record<string, { value: string; color?: number[] }> = {};
      ids.forEach((id, index) => {
        const value = hoverData[index];
        if (value === undefined) return;
        valuesRecord[id] = { value: String(value), color: colors[index] ?? [255, 255, 255] };
      });
      return Object.keys(valuesRecord).length > 0
        ? [{ type: "Channels" as const, values: valuesRecord }]
        : [];
    },
    [ids, colors, setPixelValues],
  );

  return { layers: [multiscaleLayer], getTooltipItems };
};
