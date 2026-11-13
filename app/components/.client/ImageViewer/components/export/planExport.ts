import type { ResolutionPreset, ViewerStoreSource } from "./composeCapture";
import type { LegendItem } from "./decorations";
import { frameCurrentView, frameRegion } from "./frameExport";
import { rectangleRegions } from "./regionSelection";
import { channelsStateForPanel } from "../../state/store/selectors";
import type { ViewerStore, ViewState } from "../../state/store/types";
import { geometriesBounds } from "../annotations/flyToFeature";
import { millimetersPerUnit } from "../canvas/Measurements/utils";

/** How long a run may wait for the capture deck to settle before failing.
 * The capture renders at a lifted zoom — one pyramid level finer than the
 * on-screen view — so on a cold WSI every tile of that level is a fresh S3
 * fetch the live panel never warmed. Tens of seconds of tile traffic is
 * normal there; 30 s cut real scans off mid-load. */
export const RENDER_TIMEOUT_MS = 180_000;

/** Everything the capture run needs, resolved once at click time — a pure
 * derivation from the store, no mounting. The deck that renders the plan is
 * mounted by the section, inside the app tree (and its ViewerStoreProvider —
 * the shared layer hooks crash outside it). */
export interface CapturePlan {
  /** Framing the deck renders — width/height equal the CSS size of the deck. */
  viewState: ViewState;
  /** Device-pixel multiplier for the drawing buffer (the export scale). */
  devicePixels: number;
  /** Level-0 pixel extent the on-screen framing covers — the native budget. */
  level0Width: number;
  level0Height: number;
  /** mm per level-0 pixel, from the image's physical pixel size. */
  millimetersPerLevel0Pixel: number;
  /** Acquisition metadata — the magnification source. */
  metadata: ViewerStore["metadata"];
  /** Legend entries: visible channels then enabled overlay markers. */
  legendItems: LegendItem[];
}

export interface PlanExportInput {
  store: ViewerStoreSource;
  preset: ResolutionPreset;
  /** Selected region feature id, when the source is an annotation region. */
  regionFeatureId?: string | null;
}

/** Builds the legend entries — visible channels then enabled overlay markers,
 *  in their assigned colors, exactly as the viewer renders them. Visibility
 *  lives in the per-preset layersStates merge (the top-level channels entries
 *  carry image data only), so the panel's resolved channelsState is the
 *  source of truth — same as useChannelsLayer. */
const legendItemsForState = (store: ViewerStoreSource): LegendItem[] => {
  const state = store.getState();
  const items: LegendItem[] = [];

  const panelId = state.imagePanels[state.imagePanelIndex];
  const channelsState = channelsStateForPanel(panelId)(state);
  for (const id of state.channelIds) {
    const channel = channelsState?.[id];
    if (!channel?.isVisible) continue;
    items.push({ name: id, color: channel.color ?? [255, 255, 255] });
  }

  const layerState = state.layersStates[panelId];
  const overlays = layerState?.overlays ?? {};
  for (const entry of Object.values(overlays)) {
    for (const [markerKey, marker] of Object.entries(entry.markers)) {
      if (!marker.isVisible) continue;
      items.push({ name: marker.label ?? markerKey, color: marker.color });
    }
  }

  return items;
};

/** Resolves the capture's framing and scale from the store — the extent the
 *  active panel shows (the current viewport, or the selected region's bounds
 *  with the shared margin), lifted to the preset's pixel width. */
export const planExport = ({ store, preset, regionFeatureId }: PlanExportInput): CapturePlan => {
  const state = store.getState();
  const viewStateActive = state.viewStateActive;
  const metadata = state.metadata;
  if (!viewStateActive || !metadata) {
    throw new Error("No image view is active to capture.");
  }

  const regions = regionFeatureId
    ? rectangleRegions(state.annotationSets).find((region) => region.id === regionFeatureId)
    : null;
  if (regionFeatureId && !regions) {
    throw new Error("The selected annotation region is no longer available.");
  }
  const regionGeometry = regions?.feature.geometry ?? null;
  if (regionFeatureId && !regionGeometry) {
    throw new Error("The selected annotation region has no geometry.");
  }

  // The on-screen framing (scale 1) fixes the exported extent and the
  // native-resolution budget; the render framing lifts its zoom to put the
  // preset's pixel width in the buffer.
  const framed = regionGeometry
    ? frameRegion(viewStateActive, geometriesBounds([regionGeometry])!, 1)
    : frameCurrentView(viewStateActive, 1);

  // The preset's DPI applies to the image's intended use (half a screen /
  // slide / page): the scale targets the preset's pixel width against the
  // viewport, never the tissue's physical size.
  const scaleFactor = preset.targetWidthPx / framed.viewState.width;
  const scale = Math.max(1, scaleFactor);
  const scaled = regionGeometry
    ? frameRegion(viewStateActive, geometriesBounds([regionGeometry])!, scale)
    : frameCurrentView(viewStateActive, scale);

  const millimetersPerLevel0Pixel =
    (metadata.Pixels.PhysicalSizeX ?? 1) * millimetersPerUnit(metadata.Pixels.PhysicalSizeXUnit);

  return {
    viewState: scaled.viewState,
    devicePixels: scale,
    level0Width: framed.level0Width,
    level0Height: framed.level0Height,
    millimetersPerLevel0Pixel,
    metadata,
    legendItems: legendItemsForState(store),
  };
};
