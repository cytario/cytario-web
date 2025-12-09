import { ReactNode, useMemo } from "react";

import { createMarkerProps } from "./markerUniforms";
import { OverlaysLayer } from "./OverlaysLayer";
import { select } from "../../../state/selectors";
import { useViewerStore } from "../../../state/ViewerStoreContext";
import { useTilesLoading } from "../../../utils/useTilesLoading";
import { useNotificationStore } from "~/components/Notification/Notification.store";

type SetTooltip = (
  tooltip: { content: ReactNode; x: number; y: number } | null
) => void;

/**
 * Hook to create overlays layers for the image viewer.
 */
export const useOverlaysLayers = (
  imagePanelId: number,
  setTooltip?: SetTooltip
) => {
  const layersStates = useViewerStore(select.layersStates);
  const metadata = useViewerStore(select.metadata);
  const minZoom = useViewerStore(select.minZoom);
  const maxZoom = useViewerStore(select.maxZoom);
  const panelLayersStateIndex = useViewerStore((state) => state.imagePanels)[
    imagePanelId
  ];
  const setIsOverlaysLoading = useViewerStore(select.setIsOverlaysLoading);
  const { loadTile, finishTile } = useTilesLoading(
    imagePanelId,
    setIsOverlaysLoading
  );

  const imageWidth = metadata?.Pixels?.SizeX ?? 0;
  const imageHeight = metadata?.Pixels?.SizeY ?? 0;

  const fillOpacity =
    layersStates[panelLayersStateIndex]?.overlaysFillOpacity ?? 0.8;
  const showCellOutline =
    layersStates[panelLayersStateIndex]?.showCellOutline ?? true;

  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const overlaysLayers = useMemo(() => {
    const layersState = layersStates[panelLayersStateIndex];
    const overlayState = layersState?.overlays;

    if (!overlayState) return [];

    return Object.keys(overlayState).map((resourceId) => {
      const fileMarkers = overlayState[resourceId];

      const enabledMarkers = Object.keys(fileMarkers).filter(
        (key) => fileMarkers[key].isVisible
      );

      // Build marker props directly from fileMarkers
      const markerProps = createMarkerProps(fileMarkers, fillOpacity);

      return OverlaysLayer({
        resourceId,
        enabledMarkers,
        fileMarkers,
        markerProps,
        setTooltip,
        imageWidth,
        imageHeight,
        addNotification,
        minZoom,
        maxZoom,
        strokeOpacity: showCellOutline ? 1 : 0,
        loadTile,
        finishTile,
      });
    });
  }, [
    layersStates,
    panelLayersStateIndex,
    setTooltip,
    imageWidth,
    imageHeight,
    addNotification,
    minZoom,
    maxZoom,
    fillOpacity,
    showCellOutline,
    loadTile,
    finishTile,
  ]);

  return overlaysLayers;
};
