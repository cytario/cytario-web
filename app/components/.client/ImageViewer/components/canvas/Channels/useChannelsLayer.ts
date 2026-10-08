import { PickingInfo } from "@deck.gl/core";
import { MultiscaleImageLayer, ColorPaletteExtension } from "@hms-dbmi/viv";
import { useCallback, useMemo } from "react";

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

export const useChannelsLayer = (
  imagePanelId: number,
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
  // admitted channels — or a channel's selection values — changes. The key
  // serializes the columns' ids+selections, not every renderable channel:
  // beyond MAX_CHANNELS the cap admits different channels as visibility
  // toggles reshuffle the budget, and `selections` must follow that admission
  // (its index pairs with colors/contrastLimits/channelsVisible by position).
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

      const wrappedLoader = Object.create(Object.getPrototypeOf(loaderLevel));
      Object.assign(wrappedLoader, loaderLevel);

      wrappedLoader.getTile = async (params: Parameters<typeof originalGetTile>[0]) => {
        const tileId = `${params.x}-${params.y}-${params.selection?.z || 0}`;

        loadTile(tileId);

        try {
          // Shared across panels: a second ImagePanel's getTile resolves from memory
          // instead of refetching. Keyed by level + tile coords + full selection;
          // namespaced to rawLoader so an image switch drops the cache. signal is
          // intentionally excluded from the key.
          const cacheKey = `${levelIndex}:${params.x}:${params.y}:${selectionKey(params.selection)}`;
          const result = await getCachedTile(rawLoader, cacheKey, () => originalGetTile(params));

          finishTile(tileId);

          return result;
        } catch (error) {
          finishTile(tileId);

          // deck.gl aborts in-flight tiles on every viewport change. Its Tile2DHeader
          // treats a getTileData REJECTION as terminal (content = null, _isLoaded = true —
          // never re-requested), so rethrowing the loader's AbortError permanently parks
          // the tile at its parent (blurry) level after a rapid zoom. viv's own loaders
          // convert their abort to a null return via the SIGNAL_ABORTED sentinel, which
          // deck.gl marks as cancelled — non-terminal, refinable. Plugin loaders (qptiff
          // et al.) throw DOMException AbortError, so do the same conversion here: a
          // caller-aborted tile returns null instead of rejecting.
          if (error instanceof DOMException && error.name === "AbortError") {
            return null;
          }
          if (error instanceof Error && error.name === "AbortError") {
            return null;
          }

          throw error;
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
      pickable: true,
      onTileError: (error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (error instanceof Error && error.name === "AbortError") return;
        if (error instanceof AggregateError && error.errors.every((e) => e?.name === "AbortError"))
          return;
        console.error(error);
      },
    } as unknown as MultiscaleImageLayerProps);
  }, [
    loader,
    extensions,
    selections,
    contrastLimits,
    colors,
    channelsVisible,
    dtype,
    channelsOpacity,
    imagePanelId,
  ]);

  // `colors` and `ids` are parallel arrays from `mapChannelConfigsToState`, which
  // now includes hidden-but-initialized channels; filter to the visible ones so
  // tooltips and pixel readouts only cover channels the user can actually see.
  // `selectionIndex` keeps each visible channel's position in the columns (and
  // thus in `selections` and viv's per-selection hoverData) — the column index
  // and the visible index diverge as soon as any hidden channel precedes a
  // visible one.
  const visibleChannels = useMemo(() => {
    const result: { id: string; color: number[]; selectionIndex: number }[] = [];
    for (let i = 0; i < ids.length; i++) {
      if (!channelsVisible[i]) continue;
      result.push({ id: ids[i], color: colors[i] ?? [255, 255, 255], selectionIndex: i });
    }
    return result;
  }, [ids, colors, channelsVisible]);

  const getTooltipItems = useCallback(
    (info: PickingInfo): LayerTooltipItem[] => {
      const data = handleImageViewerHover(info);
      if (!data) return [];

      const { hoverData } = data;

      // hoverData is indexed by the columns' (selections') order, which includes
      // hidden-but-initialized channels — read each visible channel's intensity
      // through its own selectionIndex, not its position among the visible ones.
      const ids = visibleChannels.map((c) => c.id);
      const values = visibleChannels.map((c) => hoverData[c.selectionIndex] ?? 0);
      setPixelValues(ids, values);

      const valuesRecord: Record<string, { value: string; color?: number[] }> = {};
      for (const { id, color, selectionIndex } of visibleChannels) {
        const value = hoverData[selectionIndex];
        if (value === undefined) continue;
        valuesRecord[id] = { value: String(value), color };
      }
      return Object.keys(valuesRecord).length > 0
        ? [{ type: "Channels" as const, values: valuesRecord }]
        : [];
    },
    [visibleChannels, setPixelValues],
  );

  return { layers: [multiscaleLayer], getTooltipItems };
};
