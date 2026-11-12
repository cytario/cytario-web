import { createRoot, type Root } from "react-dom/client";

import { CaptureDeck } from "./CaptureDeck";
import {
  composeCapture,
  type ExportDecorations,
  type ExportViewResult,
  type ResolutionPreset,
  ViewerStoreSource,
} from "./composeCapture";
import type { LegendItem } from "./decorations";
import { frameCurrentView, frameRegion } from "./frameExport";
import { rectangleRegionsOfOwnSets } from "./regionSelection";
import { geometriesBounds } from "../annotations/flyToFeature";
import { millimetersPerUnit } from "../canvas/Measurements/utils";

/** How long a run may wait for the capture deck to settle before failing. */
const RENDER_TIMEOUT_MS = 30_000;

export interface RunExportInput {
  store: ViewerStoreSource;
  preset: ResolutionPreset;
  decorations: ExportDecorations;
  /** Name of the image file (without extension) — the export filename base. */
  imageBasename: string;
  /** Selected region feature id, when the source is an annotation region. */
  regionFeatureId?: string | null;
}

/** Builds the legend entries — visible channels then enabled overlay markers,
 *  in their assigned colors, exactly as the viewer renders them. */
const legendItemsForState = (store: ViewerStoreSource): LegendItem[] => {
  const state = store.getState();
  const items: LegendItem[] = [];

  const layersStateIndex = state.imagePanels[state.imagePanelIndex];
  const layerState = state.layersStates[layersStateIndex];
  for (const id of state.channelIds) {
    const channel = state.channels[id];
    const isVisible = channel?.isVisible && layerState?.channels[id]?.isVisible !== false;
    if (!isVisible || !channel) continue;
    items.push({ name: id, color: channel.color ?? [255, 255, 255] });
  }

  const overlays = layerState?.overlays ?? {};
  for (const entry of Object.values(overlays)) {
    for (const [markerKey, marker] of Object.entries(entry.markers)) {
      if (!marker.isVisible) continue;
      items.push({ name: marker.label ?? markerKey, color: marker.color });
    }
  }

  return items;
};

/** Runs one capture: mounts a hidden full-size CaptureDeck at the framed view
 *  state, waits for every layer to settle, composites the decorations, and
 *  delivers the PNG to the destination. The deck exists only for the run. */
export const runExport = async ({
  store,
  preset,
  decorations,
  imageBasename,
  regionFeatureId,
}: RunExportInput): Promise<ExportViewResult> => {
  const state = store.getState();
  const viewStateActive = state.viewStateActive;
  const metadata = state.metadata;
  if (!viewStateActive || !metadata) {
    throw new Error("No image view is active to capture.");
  }

  const regions = regionFeatureId
    ? rectangleRegionsOfOwnSets(state).find((region) => region.id === regionFeatureId)
    : null;
  if (regionFeatureId && !regions) {
    throw new Error("The selected annotation region is no longer available.");
  }

  // The framed extent: the current viewport, or the selected region's bounds
  // with the shared margin — exactly what the active panel shows.
  const framed =
    regions && regions.feature.geometry
      ? (() => {
          const bounds = geometriesBounds([regions.feature.geometry]);
          if (!bounds) throw new Error("The selected annotation region has no geometry.");
          return frameRegion(viewStateActive, bounds, 1);
        })()
      : frameCurrentView(viewStateActive, 1);

  const mmPerLevel0Px =
    (metadata.Pixels.PhysicalSizeX ?? 1) * millimetersPerUnit(metadata.Pixels.PhysicalSizeXUnit);
  const level0Width = framed.level0Width;
  const level0Height = framed.level0Height;
  const widthMm = level0Width * mmPerLevel0Px;
  const heightMm = level0Height * mmPerLevel0Px;

  // Pixels per CSS px: the deck's CSS size is the framing's own aspect at a
  // manageable base, and devicePixels lifts the buffer to the preset density.
  const targetWidthPx = (widthMm / 25.4) * preset.dpi;
  const targetHeightPx = (heightMm / 25.4) * preset.dpi;
  const scaleFactor = Math.min(
    targetWidthPx / framed.viewState.width,
    targetHeightPx / framed.viewState.height,
  );
  const scale = Math.max(1, scaleFactor);
  const scaledFramed = regions
    ? (() => {
        const bounds = geometriesBounds([regions.feature.geometry]);
        if (!bounds) throw new Error("The selected annotation region has no geometry.");
        return frameRegion(viewStateActive, bounds, scale);
      })()
    : frameCurrentView(viewStateActive, scale);

  const canvas = await renderCaptureDeck(store, scaledFramed, scale);

  return composeCapture(canvas, {
    dpi: preset.dpi,
    imageBasename,
    decorations,
    level0Width,
    level0Height,
    millimetersPerLevel0Pixel: mmPerLevel0Px,
    metadata,
    legendItems: legendItemsForState(store),
  });
};

/** Mounts the hidden CaptureDeck for the run and resolves with the deck canvas
 *  once every layer reports loaded. */
const renderCaptureDeck = async (
  store: ViewerStoreSource,
  framed: ReturnType<typeof frameCurrentView>,
  scale: number,
): Promise<HTMLCanvasElement> => {
  const width = framed.viewState.width;
  const height = framed.viewState.height;

  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);

  const canvas = await new Promise<HTMLCanvasElement>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("The capture timed out waiting for the image tiles to finish loading."));
    }, RENDER_TIMEOUT_MS);

    root.render(
      <CaptureDeck
        viewState={framed.viewState}
        width={width}
        height={height}
        devicePixels={scale}
        onSettled={(deckCanvas) => {
          window.clearTimeout(timer);
          resolve(deckCanvas);
        }}
      />,
    );
  });

  const unmount = new Promise<void>((resolve) => {
    root.unmount();
    // unmount is async in react-dom/client; flush by resolving after the call.
    resolve();
  });
  await unmount;
  host.remove();

  return canvas;
};
