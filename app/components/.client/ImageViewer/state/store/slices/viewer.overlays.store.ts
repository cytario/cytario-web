import { invalidateOverlayTiles } from "../../../utils/sharedTileCache";
import type { OverlaysState, OverlayState, RGBA, ViewerSlice } from "../types";
import type { OverlayConfig } from "~/utils/db/overlayConfig";
import { resetOverlayErrorReporting } from "~/utils/db/overlayErrorOnce";

/**
 * Overlay (cell-segmentation) actions. The overlay state itself lives in the
 * per-panel `layersStates` owned by the channels slice; these actions mutate it
 * via the shared draft.
 */
export interface OverlaysSlice {
  addOverlaysState: (overlaysState: OverlaysState) => void;
  updateOverlaysState: (overlayId: string, overlayState: OverlayState) => void;
  updateOverlayConfig: (
    resourceId: string,
    config: OverlayConfig | null,
    markers: OverlayState,
  ) => void;
  removeOverlaysState: (overlaysStateId: string) => void;
  setOverlaysFillOpacity: (fillOpacity: number) => void;
  setShowCellOutline: (show: boolean) => void;
  setMarkerVisibility: (fileName: string, markerName: string, isVisible: boolean) => void;
  setMarkerColor: (fileName: string, markerName: string, color: RGBA) => void;
  setIsOverlaysLoading: (imagePanelId: number, count: number) => void;
}

export const createOverlaysSlice: ViewerSlice<OverlaysSlice> = (set) => ({
  addOverlaysState: (overlaysState) =>
    set(
      (state) => {
        const activeImagePanelIndex = state.imagePanels[state.imagePanelIndex];
        const layerState = state.layersStates[activeImagePanelIndex];
        if (layerState) {
          Object.assign(layerState.overlays, overlaysState);
        }
      },
      false,
      "addOverlaysState",
    ),

  updateOverlaysState: (overlayId, overlayState) =>
    set(
      (state) => {
        const activeImagePanelIndex = state.imagePanels[state.imagePanelIndex];
        const layerState = state.layersStates[activeImagePanelIndex];
        if (layerState?.overlays[overlayId]) {
          layerState.overlays[overlayId].markers = overlayState;
        }
      },
      false,
      "updateOverlaysState",
    ),

  // Callers precompute the rebuilt markers (counts need a DuckDB round-trip);
  // the store stays synchronous. Reconfiguration invalidates cached tiles and
  // re-arms error reporting for the resource.
  updateOverlayConfig: (resourceId, config, markers) =>
    set(
      (state) => {
        const activeImagePanelIndex = state.imagePanels[state.imagePanelIndex];
        const entry = state.layersStates[activeImagePanelIndex]?.overlays[resourceId];
        if (!entry) return;
        entry.config = config;
        entry.markers = markers;
      },
      false,
      "updateOverlayConfig",
    ),
  removeOverlaysState: (overlaysStateId) =>
    set(
      (state) => {
        const activeImagePanelIndex = state.imagePanels[state.imagePanelIndex];
        const overlays = state.layersStates[activeImagePanelIndex]?.overlays;
        if (overlays) {
          delete overlays[overlaysStateId];
        }
      },
      false,
      "removeOverlaysState",
    ),

  setOverlaysFillOpacity: (fillOpacity) =>
    set(
      (state) => {
        const activeImagePanelIndex = state.imagePanels[state.imagePanelIndex];
        const layerState = state.layersStates[activeImagePanelIndex];
        if (layerState) {
          layerState.overlaysFillOpacity = fillOpacity;
        }
      },
      false,
      "setOverlaysFillOpacity",
    ),

  setShowCellOutline: (showCellOutline) =>
    set(
      (state) => {
        const activeImagePanelIndex = state.imagePanels[state.imagePanelIndex];
        const layerState = state.layersStates[activeImagePanelIndex];
        if (layerState) {
          layerState.showCellOutline = showCellOutline;
        }
      },
      false,
      "setShowCellOutline",
    ),

  setMarkerVisibility: (fileName, markerName, isVisible) =>
    set(
      (state) => {
        const activeImagePanelIndex = state.imagePanels[state.imagePanelIndex];
        const overlays = state.layersStates[activeImagePanelIndex]?.overlays;
        if (overlays?.[fileName]?.markers[markerName]) {
          overlays[fileName].markers[markerName].isVisible = isVisible;
        }
      },
      false,
      "setMarkerVisibility",
    ),

  setMarkerColor: (fileName, markerName, color) =>
    set(
      (state) => {
        const activeImagePanelIndex = state.imagePanels[state.imagePanelIndex];
        const overlays = state.layersStates[activeImagePanelIndex]?.overlays;
        if (overlays?.[fileName]?.markers[markerName]) {
          overlays[fileName].markers[markerName].color = color;
        }
      },
      false,
      "setMarkerColor",
    ),

  setIsOverlaysLoading: (imagePanelId, count) =>
    set(
      (state) => {
        const layersStateIndex = state.imagePanels[imagePanelId];
        const layerState = state.layersStates[layersStateIndex];
        if (layerState) {
          layerState.isOverlaysLoading = count;
        }
      },
      false,
      "setIsOverlaysLoading",
    ),
});

/** Side effects for overlay reconfiguration — called by the UI action layer. */
export function applyOverlayReconfiguration(resourceId: string): void {
  invalidateOverlayTiles(resourceId);
  resetOverlayErrorReporting(resourceId);
}
