import { PickingInfo } from "@deck.gl/core";
import { MultiscaleImageLayer, ColorPaletteExtension } from "@hms-dbmi/viv";
import { useMemo } from "react";

import { select } from "../../../state/selectors";
import { useViewerStore } from "../../../state/ViewerStoreContext";
import { mapChannelConfigsToState } from "../../../utils/mapChannelConfigsToState";
import { useTilesLoading } from "../../../utils/useTilesLoading";

const EMPTY_OBJECT = Object.freeze({});

type MultiscaleImageLayerProps = ConstructorParameters<
  typeof MultiscaleImageLayer
>[0];

export const useChannelsLayer = (
  imagePanelId: number,
  onHover?: (info: PickingInfo) => void
) => {
  const dtype = useViewerStore((state) => {
    const type = state.metadata?.Pixels.Type ?? "Uint8";
    return type;
  });

  const channelsState = useViewerStore((state) => {
    const channelsStateIndex = state.imagePanels[imagePanelId];
    const layersState = state.layersStates[channelsStateIndex];

    return layersState?.channels ?? EMPTY_OBJECT;
  });

  const channelsStateColumns = useMemo(
    () => mapChannelConfigsToState(channelsState ?? {}),
    [channelsState]
  );

  const extensions = useMemo(() => [new ColorPaletteExtension()], []);

  const { selections, contrastLimits, colors, channelsVisible } =
    channelsStateColumns;

  const rawLoader = useViewerStore(select.loader);
  const setIsChannelsLoading = useViewerStore(select.setIsChannelsLoading);
  const { loadTile, finishTile } = useTilesLoading(
    imagePanelId,
    setIsChannelsLoading
  );
  const channelsOpacity = useViewerStore((state) => {
    const channelsStateIndex = state.imagePanels[imagePanelId];
    return state.layersStates[channelsStateIndex]?.channelsOpacity ?? 1;
  });

  // Wrap loader to track tile loading

  const loader = useMemo(() => {
    if (!rawLoader || rawLoader.length === 0) return rawLoader;

    return rawLoader.map((loaderLevel) => {
      const originalGetTile = loaderLevel.getTile.bind(loaderLevel);

      // Create wrapped loader that preserves all original properties
      const wrappedLoader = Object.create(Object.getPrototypeOf(loaderLevel));
      Object.assign(wrappedLoader, loaderLevel);

      wrappedLoader.getTile = async (
        params: Parameters<typeof originalGetTile>[0]
      ) => {
        const tileId = `${params.x}-${params.y}-${params.selection?.z || 0}`;

        loadTile(tileId);

        try {
          const result = await originalGetTile(params);

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

  const multiscaleLayer = useMemo(() => {
    if (!loader || loader.length === 0) return null;

    return new MultiscaleImageLayer({
      loader,
      extensions,
      selections,
      contrastLimits,
      colors,
      channelsVisible,
      dtype,
      onHover,
      opacity: channelsOpacity,
    } as MultiscaleImageLayerProps);
  }, [
    loader,
    extensions,
    selections,
    contrastLimits,
    colors,
    channelsVisible,
    dtype,
    onHover,
    channelsOpacity,
  ]);

  return multiscaleLayer;
};
