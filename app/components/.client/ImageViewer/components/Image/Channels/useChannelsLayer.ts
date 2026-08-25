import { PickingInfo } from "@deck.gl/core";
import { MultiscaleImageLayer, ColorPaletteExtension } from "@hms-dbmi/viv";
import { useCallback, useMemo } from "react";

import { channelsStateForPanel, select } from "../../../state/store/selectors";
import {
  type CytarioLayerResult,
  type TooltipItem,
} from "../../../state/store/slices/viewer.view.store";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { handleImageViewerHover } from "../../../utils/handleImageViewerHover";
import { mapChannelConfigsToState } from "../../../utils/mapChannelConfigsToState";
import { getCachedTile } from "../../../utils/sharedTileCache";
import { useTilesLoading } from "../../../utils/useTilesLoading";

const EMPTY_OBJECT = Object.freeze({});

type MultiscaleImageLayerProps = ConstructorParameters<typeof MultiscaleImageLayer>[0];

export const useChannelsLayer = (
  imagePanelId: number,
): CytarioLayerResult<InstanceType<typeof MultiscaleImageLayer> | null> => {
  const dtype = useViewerStore((state) => {
    const type = state.metadata?.Pixels.Type ?? "Uint8";
    return type;
  });

  const channelsState = useViewerStore(channelsStateForPanel(imagePanelId)) ?? EMPTY_OBJECT;

  const channelsStateColumns = useMemo(
    () => mapChannelConfigsToState(channelsState ?? {}),
    [channelsState],
  );

  const extensions = useMemo(() => [new ColorPaletteExtension()], []);

  const { selections, contrastLimits, colors, channelsVisible, ids } = channelsStateColumns;

  const rawLoader = useViewerStore(select.loader);
  const setIsChannelsLoading = useViewerStore(select.setIsChannelsLoading);
  const setPixelValues = useViewerStore(select.setPixelValues);
  const { loadTile, finishTile } = useTilesLoading(imagePanelId, setIsChannelsLoading);
  const channelsOpacity = useViewerStore((state) => {
    const channelsStateIndex = state.imagePanels[imagePanelId];
    return state.layersStates[channelsStateIndex]?.channelsOpacity ?? 1;
  });

  // Wrap loader to track tile loading

  const loader = useMemo(() => {
    if (!rawLoader || rawLoader.length === 0) return rawLoader;

    return rawLoader.map((loaderLevel, levelIndex) => {
      const originalGetTile = loaderLevel.getTile.bind(loaderLevel);

      // Create wrapped loader that preserves all original properties
      const wrappedLoader = Object.create(Object.getPrototypeOf(loaderLevel));
      Object.assign(wrappedLoader, loaderLevel);

      wrappedLoader.getTile = async (params: Parameters<typeof originalGetTile>[0]) => {
        const tileId = `${params.x}-${params.y}-${params.selection?.z || 0}`;

        loadTile(tileId);

        try {
          // Shared across panels: a second ImagePanel's getTile resolves from
          // memory instead of refetching. Keyed by pyramid level + tile coords
          // + full selection (channel/z/t); namespaced to rawLoader so an image
          // switch drops the cache. signal is intentionally excluded from the key.
          const cacheKey = `${levelIndex}:${params.x}:${params.y}:${JSON.stringify(params.selection)}`;
          const result = await getCachedTile(rawLoader, cacheKey, () => originalGetTile(params));

          finishTile(tileId);

          return result;
        } catch (error) {
          finishTile(tileId);

          throw error;
        }
      };

      return wrappedLoader as typeof rawLoader;
    });
  }, [finishTile, loadTile, rawLoader]);

  // Channel sublayers are pickable so the composite hover hook can find
  // the channels pick via `pickMultipleObjects` and read pixel values
  // through `handleImageViewerHover`. The explicit id lets the composite
  // hook identify this layer among all picks. No per-layer `onHover` is
  // set — the composite hook handles all hover orchestration.
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

  // Extract visible channel ids + colors for tooltip mapping. `colors` and
  // `ids` are parallel arrays from `mapChannelConfigsToState` (already
  // filtered to visible channels); we zip them here so `getTooltipItems`
  // can build TooltipItems without re-reading the store on every hover event.
  const visibleChannels = useMemo(() => {
    const result: { id: string; color: number[] }[] = [];
    for (let i = 0; i < ids.length; i++) {
      result.push({ id: ids[i], color: colors[i] ?? [255, 255, 255] });
    }
    return result;
  }, [ids, colors]);

  const getTooltipItems = useCallback(
    (info: PickingInfo): TooltipItem[] => {
      const data = handleImageViewerHover(info);
      if (!data) return [];

      const { hoverData } = data;

      // Update the sidebar pixel-value readout (replaces the old
      // `onMultiscaleLayerHover` → `setPixelValues` path). Channels without
      // loaded tile data fall back to 0, matching the previous behaviour.
      const ids = visibleChannels.map((c) => c.id);
      const values = visibleChannels.map((_, i) => hoverData[i] ?? 0);
      setPixelValues(ids, values);

      const items: TooltipItem[] = [];
      for (let i = 0; i < visibleChannels.length; i++) {
        const { id, color } = visibleChannels[i];
        const value = hoverData[i];
        if (value === undefined) continue;
        items.push({
          providerId: "channels",
          kind: "channel",
          label: id,
          values: [{ key: "", value: String(value), color }],
        });
      }
      return items;
    },
    [visibleChannels, setPixelValues],
  );

  return { layers: [multiscaleLayer], getTooltipItems };
};
