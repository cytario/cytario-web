import { PickingInfo } from "@deck.gl/core";
import { MultiscaleImageLayer } from "@hms-dbmi/viv";
import { useCallback, useMemo } from "react";

import {
  buildChannelsLayer,
  visibleChannelsOfColumns,
} from "../../../export/buildChannelsLayerConfig";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { channelsStateForPanel, select } from "../../../state/store/selectors";
import {
  type CytarioLayerResult,
  type ChannelsState,
  type LayerTooltipItem,
} from "../../../state/store/types";
import { handleImageViewerHover } from "../../../utils/handleImageViewerHover";
import { mapChannelConfigsToState } from "../../../utils/mapChannelConfigsToState";
import { useTilesLoading } from "../../../utils/useTilesLoading";

const EMPTY_OBJECT = Object.freeze({}) as ChannelsState;

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

  const rawLoader = useViewerStore(select.loader);
  const setIsChannelsLoading = useViewerStore(select.setIsChannelsLoading);
  const setPixelValues = useViewerStore(select.setPixelValues);
  const { loadTile, finishTile } = useTilesLoading(imagePanelId, setIsChannelsLoading);
  const channelsOpacity = useViewerStore((state) => {
    const channelsStateIndex = state.imagePanels[imagePanelId];
    return state.layersStates[channelsStateIndex]?.channelsOpacity ?? 1;
  });

  // The stable columns pair the memoized `selections` array with the fresh
  // contrast/color/visibility columns — identity-stable selections below,
  // live uniforms above, exactly as before the builder extraction.
  const stableColumns = useMemo(
    () => ({ ...columnsWithoutSelections, selections: stableSelections }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [admittedSelectionsKey, columnsWithoutSelections],
  );

  // Channel sublayers are pickable so the composite hover hook can find the
  // channels pick via `pickMultipleObjects`; the explicit id lets it identify this
  // layer. No per-layer `onHover` — the composite hook handles all hover orchestration.
  const multiscaleLayer = useMemo(
    () =>
      buildChannelsLayer({
        imagePanelId,
        columns: stableColumns,
        rawLoader,
        dtype,
        channelsOpacity,
        loadTile,
        finishTile,
      }),
    [imagePanelId, stableColumns, rawLoader, dtype, channelsOpacity, loadTile, finishTile],
  );

  // `colors` and `ids` are parallel arrays from `mapChannelConfigsToState`, which
  // now includes hidden-but-initialized channels; filter to the visible ones so
  // tooltips and pixel readouts only cover channels the user can actually see.
  // `selectionIndex` keeps each visible channel's position in the columns (and
  // thus in `selections` and viv's per-selection hoverData) — the column index
  // and the visible index diverge as soon as any hidden channel precedes a
  // visible one.
  const visibleChannels = useMemo(() => visibleChannelsOfColumns(stableColumns), [stableColumns]);

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
