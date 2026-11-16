import { captureBounds, frameCapture, viewStateForFrame, type CaptureFrame } from "./captureFrame";
import { fallbackRenderLimits, type ExportRenderLimits } from "./clamp";
import type { ResolutionPreset, ViewerStoreSource } from "./composeCapture";
import { outputPixelsPerViewerPixel, type Legend } from "./decorations";
import { rectangleRegions } from "./regionSelection";
import { channelsStateForPanel } from "../../state/store/selectors";
import type { ViewerStore, ViewState } from "../../state/store/types";
import { geometriesBounds } from "../annotations/flyToFeature";

/** How long a run may wait for the capture deck to settle before failing.
 * The capture renders at the output's own resolution — usually finer than the
 * on-screen view — so on a cold WSI every tile of that level is a fresh S3
 * fetch the live panel never warmed. Tens of seconds of tile traffic is
 * normal there; 30 s cut real scans off mid-load. */
export const RENDER_TIMEOUT_MS = 180_000;

/** Everything the capture run needs, resolved once at click time — a pure
 * derivation from the store, no mounting. The deck that renders the plan is
 * mounted by the section, inside the app tree (and its ViewerStoreProvider —
 * the shared layer hooks crash outside it). */
export interface CapturePlan {
  /** The exported rectangle and output size. */
  frame: CaptureFrame;
  /** View state that renders `frame` on a deck of the frame's CSS size. */
  viewState: ViewState;
  /** Output px per viewer CSS px — scales the layers' pixel-sized marks. */
  pixelScale: number;
  /** Acquisition metadata — the pixel-size source. */
  metadata: NonNullable<ViewerStore["metadata"]>;
  /** Legend entries: visible channels and enabled overlay markers. */
  legend: Legend;
}

export interface PlanExportInput {
  store: ViewerStoreSource;
  preset: ResolutionPreset;
  /** Selected region feature id, when the source is an annotation region. */
  regionFeatureId?: string | null;
  /** Limits measured at capture time; probed from the environment when omitted. */
  limits?: ExportRenderLimits;
}

/** Builds the legend — visible channels and enabled overlay markers, in their
 *  assigned colors, exactly as the viewer renders them. Visibility
 *  lives in the per-preset layersStates merge (the top-level channels entries
 *  carry image data only), so the panel's resolved channelsState is the
 *  source of truth — same as useChannelsLayer. */
const legendForState = (store: ViewerStoreSource): Legend => {
  const state = store.getState();
  const legend: Legend = { channels: [], overlays: [] };

  const panelId = state.imagePanels[state.imagePanelIndex];
  const channelsState = channelsStateForPanel(panelId)(state);
  for (const id of state.channelIds) {
    const channel = channelsState?.[id];
    if (!channel?.isVisible) continue;
    legend.channels.push({ name: id, color: channel.color ?? [255, 255, 255] });
  }

  const layerState = state.layersStates[panelId];
  const overlays = layerState?.overlays ?? {};
  for (const entry of Object.values(overlays)) {
    for (const [markerKey, marker] of Object.entries(entry.markers)) {
      if (!marker.isVisible) continue;
      legend.overlays.push({ name: marker.label ?? markerKey, color: marker.color });
    }
  }

  return legend;
};

/** Level-0 bounds of the selected region, or null for a current-view capture. */
const selectedRegionBounds = (state: ViewerStore, regionFeatureId?: string | null) => {
  if (!regionFeatureId) return null;
  const region = rectangleRegions(state.annotationSets).find(({ id }) => id === regionFeatureId);
  if (!region) throw new Error("The selected annotation region is no longer available.");
  const bounds = region.feature.geometry ? geometriesBounds([region.feature.geometry]) : null;
  if (!bounds) throw new Error("The selected annotation region has no geometry.");
  return bounds;
};

/** Resolves the capture from the store: the exported rectangle (the current
 *  view, or the selected region plus margin), its output size for the preset,
 *  and the view state that renders exactly that rectangle. */
export const planExport = ({
  store,
  preset,
  regionFeatureId,
  limits = fallbackRenderLimits(),
}: PlanExportInput): CapturePlan => {
  const state = store.getState();
  const viewStateActive = state.viewStateActive;
  const metadata = state.metadata;
  if (!viewStateActive?.width || !viewStateActive.height || !metadata) {
    throw new Error("No image view is active to capture.");
  }

  const bounds = captureBounds(viewStateActive, selectedRegionBounds(state, regionFeatureId));
  const frame = frameCapture(bounds, preset.targetWidthPx, limits);

  return {
    frame,
    viewState: viewStateForFrame(frame, viewStateActive),
    pixelScale: outputPixelsPerViewerPixel(preset.dpi),
    metadata,
    legend: legendForState(store),
  };
};
