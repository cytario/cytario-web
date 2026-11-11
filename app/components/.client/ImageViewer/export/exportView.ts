import { Deck, OrthographicView, type Effect, type FilterContext, type Layer } from "@deck.gl/core";

import { buildAnnotationsLayers } from "./buildAnnotationsLayers";
import { buildChannelsLayer, columnsForPanelState } from "./buildChannelsLayerConfig";
import { buildOverlaysLayers, overlayPanelInputs } from "./buildOverlaysLayers";
import {
  capAtNativeResolution,
  clampExportSize,
  type ExportRenderLimits,
  fallbackRenderLimits,
} from "./clamp";
import {
  computeAspectFraming,
  drawChannelLabelsDecoration,
  drawMagnificationDecoration,
  drawScaleBarDecoration,
  ensureDocumentFonts,
  magnificationText,
  millimetersPerUnit,
  type AspectChoice,
  type ChannelLabel,
} from "./decorations";
import { geometriesBounds } from "../components/annotations/flyToFeature";
import {
  OVERLAY_COMPOSITE_LAYER_ID,
  OverlayCompositeEffect,
  OverlayCompositeLayer,
  type OverlayCompositeResult,
} from "../components/canvas/Overlays/OverlayComposite";
import { isOverlayLayerId } from "../components/canvas/Overlays/OverlaysLayer";
import type { ViewState, ViewerStore } from "../state/store/types";
import { type AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

/** How long to wait for tiles/deck-idle before failing the export. */
const RENDER_TIMEOUT_MS = 30_000;

export type ExportSource =
  { kind: "current-view" } | { kind: "annotation-region"; feature: AnnotationFeature };

export type ExportDestination = "download" | "clipboard";

export interface ExportDecorations {
  scaleBar: boolean;
  magnification: boolean;
  channelLabels: boolean;
  annotationRegions: boolean;
  caption: boolean;
}

export interface ExportViewOptions {
  source: ExportSource;
  /** 1 | 2 | 4 — multiplier on the framed view's CSS size. */
  scale: number;
  aspect: AspectChoice;
  decorations: ExportDecorations;
  destination: ExportDestination;
  /** Limits measured at export time; probed from the environment when omitted. */
  limits?: ExportRenderLimits;
  /** Name of the image file (without extension) — the export filename base. */
  imageBasename: string;
}

export interface ExportViewResult {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  clamped: boolean;
  upscaled: boolean;
}

/** Live access to the viewer store — the tile-loading counters must be read
 *  at each poll, so a static state snapshot is not acceptable here. */
export type ViewerStoreSource = { getState: () => ViewerStore };

export class ExportRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportRenderError";
  }
}

/** Rectangle-polygon check: a closed 5-position ring that is axis-aligned. */
const isRectanglePolygon = (feature: AnnotationFeature): boolean => {
  const geometry = feature.geometry;
  if (!geometry || geometry.type !== "Polygon") return false;
  const ring = geometry.coordinates[0];
  if (!ring || ring.length !== 5) return false;
  const [first, second, third, fourth, fifth] = ring;
  if (!first || !second || !third || !fourth || !fifth) return false;
  const closed = first[0] === fifth[0] && first[1] === fifth[1];
  const axisAligned =
    (first[0] === second[0] &&
      second[1] === third[1] &&
      third[0] === fourth[0] &&
      fourth[1] === first[1]) ||
    (first[1] === second[1] &&
      second[0] === third[0] &&
      third[1] === fourth[1] &&
      fourth[0] === first[0]);
  return closed && axisAligned;
};

/**
 * Rectangle regions of the user's own annotation sets, identified by annotation
 * name. Unowned sets (legacy imports with no cytario envelope) count as own —
 * they are editable by anyone, matching the layer's own-set treatment.
 */
export const rectangleRegionsOfOwnSets = (
  store: ViewerStore,
): { id: string; name: string; feature: AnnotationFeature; setId: string }[] => {
  const ownSets = store.annotationSets.filter(
    (set) => !set.createdBy || set.createdBy === store.currentUserId,
  );
  const regions: { id: string; name: string; feature: AnnotationFeature; setId: string }[] = [];
  for (const set of ownSets) {
    for (const feature of set.features) {
      if (!isRectanglePolygon(feature)) continue;
      regions.push({
        id: feature.id,
        name: feature.properties?.name ?? feature.id,
        feature,
        setId: set.id,
      });
    }
  }
  return regions;
};

/** `image_YYYY-MM-DD-HHmmss` — the capture filename stem. */
export const captureFilename = (imageBasename: string): string => {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, "0");
  const date = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join("-");
  const clock = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join("");
  return `${imageBasename}_${date}-${clock}`;
};

const waitFor = (predicate: () => boolean, timeoutMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    if (predicate()) return resolve();
    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (predicate()) {
        clearInterval(interval);
        resolve();
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(interval);
        reject(
          new ExportRenderError("The capture timed out waiting for image tiles to finish loading."),
        );
      }
    }, 100);
  });

/** Counts the off-screen render's own tile loads — the export fetches pyramid
 *  levels the on-screen panel never requested, so its gate must cover them. */
const createExportTileCounter = () => {
  const pending = new Set<string>();
  return {
    loadTile: (id: string) => pending.add(id),
    finishTile: (id: string) => pending.delete(id),
    isIdle: () => pending.size === 0,
  };
};

export interface ExportViewInput {
  store: ViewerStoreSource;
  options: ExportViewOptions;
  /** Toast emitter for tile errors surfaced during the off-screen render. */
  showToast?: (toast: { variant: "error" | "success" | "info"; message: string }) => void;
}

/**
 * Renders the framed view off-screen through the same layer constructors the
 * live panel uses, then composites the decorations and encodes a PNG.
 *
 * The off-screen `Deck` runs on a detached canvas whose drawing buffer is
 * `viewport × scale` device pixels (`useDevicePixels: scale`) with
 * `zoom' = zoom + log2(scale)` on the same target (for a region export, zoom
 * frames the region's level-0 extent instead); the layers come from the
 * shared builders, so the export's colors and compositing cannot drift from
 * the on-screen composite. The render is gated on deck initialization, the
 * panel's live tile-loading counters, and the export's own tile counter —
 * with a timeout that fails the export rather than shipping a render
 * produced from coarser image data than the viewer would display once
 * loading completes.
 */
export const exportView = async ({
  store,
  options,
  showToast,
}: ExportViewInput): Promise<ExportViewResult> => {
  const initialState = store.getState();
  const viewStateActive = initialState.viewStateActive;
  const metadata = initialState.metadata;
  if (!viewStateActive || !metadata) {
    throw new ExportRenderError("No image view is active to capture.");
  }

  const imagePanelId = initialState.imagePanelIndex;

  // --- Framed view state -------------------------------------------------
  let zoom = viewStateActive.zoom + Math.log2(options.scale);
  let target = viewStateActive.target;
  // The level-0 pixel extent the export covers — the native-resolution budget.
  let framedLevel0Width = viewStateActive.width * 2 ** -viewStateActive.zoom;
  let framedLevel0Height = viewStateActive.height * 2 ** -viewStateActive.zoom;

  if (options.source.kind === "annotation-region") {
    const bounds = geometriesBounds([options.source.feature.geometry]);
    if (!bounds) throw new ExportRenderError("The selected annotation region has no geometry.");
    const [minX, minY, maxX, maxY] = bounds;
    const margin = 0.02;
    const extentWidth = (maxX - minX) * (1 + 2 * margin);
    const extentHeight = (maxY - minY) * (1 + 2 * margin);
    const viewportAspect = viewStateActive.width / viewStateActive.height;
    // The framed extent is the region's level-0 extent with a small margin,
    // expanded to the viewport's aspect so the export covers the region
    // without cropping it (fill around the region, never into it).
    framedLevel0Width = Math.max(extentWidth, extentHeight * viewportAspect);
    framedLevel0Height = framedLevel0Width / viewportAspect;
    // One drawing-buffer pixel covers framedLevel0Width / bufferWidth level-0
    // pixels — the zoom that fills the buffer with the framed extent.
    const bufferWidth = viewStateActive.width * options.scale;
    zoom = Math.log2(bufferWidth / framedLevel0Width);
    target = [(minX + maxX) / 2, (minY + maxY) / 2];
  }

  // --- Output size ---------------------------------------------------------
  const limits = options.limits ?? fallbackRenderLimits();
  const clampedSize = clampExportSize({
    viewport: { width: viewStateActive.width, height: viewStateActive.height },
    scale: options.scale,
    limits,
  });

  // Native-resolution cap: at 1 export px = 1 level-0 px the image data is
  // exhausted; beyond that only interpolation remains, allowed up to 2× and
  // flagged `upscaled` (SRS-CY-33408).
  const capped = capAtNativeResolution(clampedSize, {
    width: Math.max(framedLevel0Width, 1),
    height: Math.max(framedLevel0Height, 1),
  });

  const outputWidth = capped.width;
  const outputHeight = capped.height;

  // --- Off-screen deck -----------------------------------------------------
  const exportTileCounter = createExportTileCounter();
  // luma's CanvasContext sizes the drawing buffer from the DOM (clientWidth /
  // clientHeight), so a detached canvas stays 0x0 and renders nothing. Mount a
  // hidden fixed-position host for the export's lifetime instead.
  const hostElement = document.createElement("div");
  hostElement.style.position = "fixed";
  hostElement.style.left = "0";
  hostElement.style.top = "0";
  hostElement.style.width = `${outputWidth}px`;
  hostElement.style.height = `${outputHeight}px`;
  hostElement.style.opacity = "0";
  hostElement.style.pointerEvents = "none";
  hostElement.setAttribute("aria-hidden", "true");
  const deckCanvas = document.createElement("canvas");
  deckCanvas.style.width = "100%";
  deckCanvas.style.height = "100%";
  hostElement.appendChild(deckCanvas);
  document.body.appendChild(hostElement);
  const overlayCompositeResult: OverlayCompositeResult = {};
  const overlayComposite = new OverlayCompositeLayer({
    id: OVERLAY_COMPOSITE_LAYER_ID,
    pickable: false,
    result: overlayCompositeResult,
  });

  const buildLayers = (storeState: ViewerStore): Layer[] => {
    const layersState = storeState.layersStates[storeState.imagePanels[imagePanelId]];
    const columns = columnsForPanelState(storeState, imagePanelId);
    const channelsLayer = buildChannelsLayer({
      imagePanelId,
      columns,
      rawLoader: storeState.loader,
      dtype: metadata.Pixels.Type ?? "Uint8",
      channelsOpacity: layersState?.channelsOpacity ?? 1,
      loadTile: exportTileCounter.loadTile,
      finishTile: exportTileCounter.finishTile,
    });

    const overlaysLayers = buildOverlaysLayers(
      overlayPanelInputs(storeState, imagePanelId),
      exportTileCounter.loadTile,
      exportTileCounter.finishTile,
      showToast,
    );

    const annotationsLayers = options.decorations.annotationRegions
      ? buildAnnotationsLayers({
          features:
            storeState.annotationSets.find((s) => s.id === storeState.activeSetId)?.features ?? [],
          annotationSets: storeState.annotationSets,
          activeSetId: storeState.activeSetId,
          annotationView: storeState.annotationView,
          annotationMode: storeState.annotationMode,
          annotationStampSize: storeState.annotationStampSize,
          annotationSelectedIds: storeState.annotationSelectedIds,
          annotationsOpacity: layersState?.annotationsOpacity ?? 1,
          showOutline: layersState?.showAnnotationOutline ?? true,
          imagePanelId,
          interactive: false,
          activeClassification: null,
          onEdit: () => {},
        })
      : [];

    return [
      ...(channelsLayer ? [channelsLayer] : []),
      ...overlaysLayers,
      overlayComposite,
      ...annotationsLayers,
    ];
  };

  const viewState: ViewState = {
    ...viewStateActive,
    zoom,
    target,
    width: viewStateActive.width,
    height: viewStateActive.height,
  };

  const layerFilter = ({ layer, isPicking }: FilterContext) =>
    !isOverlayLayerId(layer.id) || isPicking;

  const effects: Effect[] = [new OverlayCompositeEffect(overlayCompositeResult)];

  const builtLayers = buildLayers(initialState);

  const deck = new Deck({
    canvas: deckCanvas,
    width: viewStateActive.width,
    height: viewStateActive.height,
    views: [
      new OrthographicView({
        id: "detail",
        width: viewStateActive.width,
        height: viewStateActive.height,
        x: 0,
        y: 0,
      }),
    ],
    layers: builtLayers,
    effects,
    layerFilter,
    viewState: { detail: viewState },
    controller: false,
    useDevicePixels: options.scale,
    getCursor: () => "default",
  });

  try {
    await waitFor(() => deck.isInitialized, RENDER_TIMEOUT_MS);

    // Tiles the on-screen panel already fetched land in the shared cache; the
    // export's own fetches (finer pyramid levels) tick the export counter.
    // Both must settle before the framebuffer is read — read through the live
    // store, since the panel's counters change as its loads complete.
    await waitFor(() => {
      const state = store.getState();
      const layersState = state.layersStates[state.imagePanels[imagePanelId]];
      return (
        (layersState?.isChannelsLoading ?? 0) === 0 &&
        (layersState?.isOverlaysLoading ?? 0) === 0 &&
        exportTileCounter.isIdle()
      );
    }, RENDER_TIMEOUT_MS);

    await waitFor(() => {
      const layers = builtLayers;
      return layers.length > 0 && layers.every((layer) => layer.isLoaded);
    }, RENDER_TIMEOUT_MS);

    // deck renders continuously (AnimationLoop); give it frames to draw with
    // the settled layers before reading the canvas.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    // --- Compose output (aspect + decorations) ----------------------------
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = outputWidth;
    outputCanvas.height = outputHeight;
    const context = outputCanvas.getContext("2d");
    if (!context) throw new ExportRenderError("Could not create the export's 2D canvas.");

    context.fillStyle = "rgb(0, 0, 0)";
    context.fillRect(0, 0, outputWidth, outputHeight);

    const framing = computeAspectFraming(deckCanvas.width, deckCanvas.height, options.aspect);
    const [sourceX, sourceY, sourceWidth, sourceHeight] = framing.source;
    const [destinationX, destinationY, destinationWidth, destinationHeight] = framing.destination;
    context.drawImage(
      deckCanvas,
      Math.max(0, Math.round(sourceX)),
      Math.max(0, Math.round(sourceY)),
      Math.max(1, Math.round(sourceWidth)),
      Math.max(1, Math.round(sourceHeight)),
      destinationX,
      destinationY,
      destinationWidth,
      destinationHeight,
    );

    if (
      options.decorations.scaleBar ||
      options.decorations.magnification ||
      options.decorations.channelLabels
    ) {
      await ensureDocumentFonts();
    }

    // Physical size of one export pixel: the framed view's level-0 coverage
    // recomputed at the export's scale (SRS-CY-33408).
    const level0PxPerExportPx = 2 ** -zoom;
    const mmPerLevel0Px =
      (metadata.Pixels.PhysicalSizeX ?? 1) * millimetersPerUnit(metadata.Pixels.PhysicalSizeXUnit);
    const mmPerExportPx = mmPerLevel0Px * level0PxPerExportPx;

    if (options.decorations.scaleBar) {
      drawScaleBarDecoration(context, { millimetersPerPixel: mmPerExportPx });
    }
    if (options.decorations.magnification) {
      const magnification = magnificationText(metadata);
      if (magnification) drawMagnificationDecoration(context, magnification.text);
    }
    if (options.decorations.channelLabels) {
      const columns = columnsForPanelState(store.getState(), imagePanelId);
      const labels: ChannelLabel[] = [];
      for (let i = 0; i < columns.ids.length; i++) {
        if (!columns.channelsVisible[i]) continue;
        labels.push({ name: columns.ids[i], color: columns.colors[i] ?? [255, 255, 255] });
      }
      drawChannelLabelsDecoration(context, labels);
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      outputCanvas.toBlob((result) => resolve(result), "image/png"),
    );
    if (!blob) throw new ExportRenderError("The captured image could not be encoded as PNG.");

    return {
      blob,
      filename: `${captureFilename(options.imageBasename)}.png`,
      width: outputWidth,
      height: outputHeight,
      clamped: clampedSize.clamped,
      upscaled: capped.upscaled,
    };
  } finally {
    deck.finalize();
    hostElement.remove();
  }
};

/** Saves the export blob as a download with the capture filename. */
export const downloadExport = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

/** Writes the export blob to the system clipboard as a PNG ClipboardItem. */
export const copyExportToClipboard = async (blob: Blob): Promise<void> => {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new ExportRenderError("This browser cannot place images on the clipboard.");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
};
