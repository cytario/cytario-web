import { PickingInfo } from "@deck.gl/core";
import { parseSync } from "@loaders.gl/core";
import { WKBLoader } from "@loaders.gl/wkt";
import { type Table } from "apache-arrow";
import type { Geometry } from "geojson";
import { useCallback, useMemo } from "react";

import { createMarkerProps } from "./markerUniforms";
import { OverlaysLayer } from "./OverlaysLayer";
import { select } from "../../../state/store/selectors";
import {
  type CytarioLayerResult,
  type LayerTooltipItem,
} from "../../../state/store/slices/viewer.view.store";
import { RGBA } from "../../../state/store/types";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { useTilesLoading } from "../../../utils/useTilesLoading";

const MARKER_PREFIX = "marker_positive_";

/**
 * Hook to create overlays layers for the image viewer.
 */
export const useOverlaysLayers = (imagePanelId: number): CytarioLayerResult => {
  const layersStates = useViewerStore(select.layersStates);
  const metadata = useViewerStore(select.metadata);
  const minZoom = useViewerStore(select.minZoom);
  const maxZoom = useViewerStore(select.maxZoom);
  const panelLayersStateIndex = useViewerStore((state) => state.imagePanels)[imagePanelId];
  const setIsOverlaysLoading = useViewerStore(select.setIsOverlaysLoading);
  const { loadTile, finishTile } = useTilesLoading(imagePanelId, setIsOverlaysLoading);

  const imageWidth = metadata?.Pixels?.SizeX ?? 0;
  const imageHeight = metadata?.Pixels?.SizeY ?? 0;

  const fillOpacity = layersStates[panelLayersStateIndex]?.overlaysFillOpacity ?? 0.8;
  const showCellOutline = layersStates[panelLayersStateIndex]?.showCellOutline ?? true;

  // Capture the overlay state for this panel so `getTooltipItems` can decode
  // marker bitmasks without re-reading the store on every hover event.
  const overlayState = layersStates[panelLayersStateIndex]?.overlays ?? null;

  const overlaysLayers = useMemo(() => {
    if (!overlayState) return [];

    return Object.keys(overlayState).map((resourceId) => {
      const fileMarkers = overlayState[resourceId];

      const enabledMarkers = Object.keys(fileMarkers).filter((key) => fileMarkers[key].isVisible);

      // Build marker props directly from fileMarkers
      const markerProps = createMarkerProps(fileMarkers, fillOpacity);

      return OverlaysLayer({
        resourceId,
        enabledMarkers,
        fileMarkers,
        markerProps,
        imageWidth,
        imageHeight,
        minZoom,
        maxZoom,
        strokeOpacity: showCellOutline ? 1 : 0,
        loadTile,
        finishTile,
      });
    });
  }, [
    overlayState,
    imageWidth,
    imageHeight,
    minZoom,
    maxZoom,
    fillOpacity,
    showCellOutline,
    loadTile,
    finishTile,
  ]);

  // Stable reference to fileMarkers + enabledMarkers for the tooltip decoder.
  // `overlayState` changes identity when the store updates, so this memo
  // tracks it correctly.
  const tooltipCtx = useMemo(() => {
    if (!overlayState) return null;
    const entries = Object.entries(overlayState);
    return entries.map(([resourceId, fileMarkers]) => ({
      resourceId,
      fileMarkers,
      enabledMarkers: Object.keys(fileMarkers).filter((key) => fileMarkers[key].isVisible),
      allMarkerKeys: Object.keys(fileMarkers),
    }));
  }, [overlayState]);

  const getTooltipItems = useCallback(
    (info: PickingInfo): LayerTooltipItem[] => {
      if (!info.picked || info.index === undefined || !tooltipCtx) return [];

      // Get Arrow table from source layer props
      const rawData = info.sourceLayer?.props?.data;
      const arrowTable = ((rawData as { src?: Table })?.src ?? rawData) as Table | undefined;
      if (!arrowTable) return [];

      const index = info.index;

      const bitmaskCol = arrowTable.getChild("marker_bitmask");
      if (!bitmaskCol) return [];

      const bitmask = bitmaskCol.get(index) as number;

      // Parse WKB geometry for the thumbnail preview.
      const geomCol = arrowTable.getChild("geom");
      let geometry: Geometry | null = null;
      if (geomCol) {
        const wkbBuffer = geomCol.get(index);
        if (wkbBuffer) {
          try {
            geometry = parseSync(wkbBuffer, WKBLoader) as Geometry;
          } catch {
            // Corrupt WKB — skip the preview.
          }
        }
      }

      // Find the matching overlay context by layer id prefix
      const layerId = info.layer?.id ?? "";
      const ctx = tooltipCtx.find((c) => layerId.startsWith(`MarkersLayer-${c.resourceId}`));
      if (!ctx) return [];

      // Stable feature id from the Arrow `id` column (fallback: row index).
      const idCol = arrowTable.getChild("id");
      const id = idCol ? String(idCol.get(index)) : String(index);

      const activeMarkers = ctx.enabledMarkers.filter((markerKey) => {
        const bitIndex = ctx.allMarkerKeys.indexOf(markerKey);
        if (bitIndex < 0 || bitIndex >= 32) return false;
        return (bitmask & (1 << bitIndex)) !== 0;
      });

      if (activeMarkers.length === 0) return [];

      const { values, geometryColor } = activeMarkers.reduce(
        (acc, marker) => {
          const color = ctx.fileMarkers[marker].color as RGBA;
          const name = marker.replace(MARKER_PREFIX, "");
          acc.values[name] = { value: "", color };
          acc.geometryColor[0] = Math.min(acc.geometryColor[0] + color[0], 255);
          acc.geometryColor[1] = Math.min(acc.geometryColor[1] + color[1], 255);
          acc.geometryColor[2] = Math.min(acc.geometryColor[2] + color[2], 255);
          return acc;
        },
        {
          values: {} as Record<string, { value: string; color?: number[] }>,
          geometryColor: [0, 0, 0] as number[],
        },
      );

      return [{ type: "Overlays" as const, id, values, geometry, geometryColor }];
    },
    [tooltipCtx],
  );

  return { layers: overlaysLayers, getTooltipItems };
};
