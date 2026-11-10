import type { Layer } from "@deck.gl/core";

import { createMarkerProps } from "../components/canvas/Overlays/markerUniforms";
import { OverlaysLayer } from "../components/canvas/Overlays/OverlaysLayer";
import type { OverlaysState, ViewerStore } from "../state/store/types";
import { DEFAULT_OVERLAYS_FILL_OPACITY } from "~/utils/overlayDefaults";

export interface OverlayPanelInputs {
  /** The panel's overlays map (resourceId → markers + config), or null when none loaded. */
  overlayState: OverlaysState | null;
  imageWidth: number;
  imageHeight: number;
  /** Zoom bounds — the viewer's store-derived `-loader.length` / `2`. */
  minZoom: number;
  maxZoom: number;
  overlaysFillOpacity: number;
  showCellOutline: boolean;
}

/** Reads one panel's overlay-layer inputs from a store snapshot. */
export const overlayPanelInputs = (
  store: ViewerStore,
  imagePanelId: number,
): OverlayPanelInputs => {
  const layersState = store.layersStates[store.imagePanels[imagePanelId]];
  return {
    overlayState: layersState?.overlays ?? null,
    imageWidth: store.metadata?.Pixels?.SizeX ?? 0,
    imageHeight: store.metadata?.Pixels?.SizeY ?? 0,
    minZoom: -(store.loader?.length ?? 0),
    maxZoom: 2,
    overlaysFillOpacity: layersState?.overlaysFillOpacity ?? DEFAULT_OVERLAYS_FILL_OPACITY,
    showCellOutline: layersState?.showCellOutline ?? true,
  };
};

/**
 * Builds the overlay marker layers for one image panel — the single
 * parameterization shared by the live `useOverlaysLayers` hook and the
 * off-screen export: both feed the same `OverlaysLayer` factory with the same
 * store-derived values, so overlay compositing cannot drift.
 */
export const buildOverlaysLayers = (
  inputs: OverlayPanelInputs,
  loadTile: (id: string) => void,
  finishTile: (id: string) => void,
  showToast?: (toast: { variant: "error" | "success" | "info"; message: string }) => void,
): Layer[] => {
  const { overlayState } = inputs;
  if (!overlayState) return [];

  const { imageWidth, imageHeight, minZoom, maxZoom, overlaysFillOpacity, showCellOutline } =
    inputs;
  const fillOpacity = overlaysFillOpacity ?? DEFAULT_OVERLAYS_FILL_OPACITY;

  return Object.entries(overlayState).map(([resourceId, entry]) => {
    const fileMarkers = entry.markers;
    const enabledMarkers = Object.keys(fileMarkers).filter((key) => fileMarkers[key].isVisible);
    const markerProps = createMarkerProps(fileMarkers, fillOpacity);

    return OverlaysLayer({
      resourceId,
      overlayConfig: entry.config,
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
      showToast,
    });
  });
};
