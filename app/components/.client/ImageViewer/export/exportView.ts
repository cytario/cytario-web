import { columnsForPanelState } from "./buildChannelsLayerConfig";
import {
  createOffscreenRenderer,
  frameCurrentView,
  frameRegion,
  type FramedExport,
} from "./offscreenRenderer";
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
  let framed: FramedExport;
  if (options.source.kind === "annotation-region") {
    const bounds = geometriesBounds([options.source.feature.geometry]);
    if (!bounds) throw new ExportRenderError("The selected annotation region has no geometry.");
    framed = frameRegion(viewStateActive, bounds, options.scale);
  } else {
    framed = frameCurrentView(viewStateActive, options.scale);
  }
  const { zoom, target } = framed.viewState;
  const framedLevel0Width = framed.level0Width;
  const framedLevel0Height = framed.level0Height;

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
  // The renderer mounts a hidden DOM host (luma sizes the drawing buffer from
  // the DOM — a detached canvas renders nothing) and drives the same shared
  // layer builders the live panel uses.
  const exportTileCounter = createExportTileCounter();
  const renderer = createOffscreenRenderer({
    store,
    width: clampedSize.width,
    height: clampedSize.height,
    devicePixelScale: options.scale,
    withAnnotations: options.decorations.annotationRegions,
    onTileLoad: exportTileCounter.loadTile,
    onTileFinish: exportTileCounter.finishTile,
  });
  const deckCanvas = renderer.canvas;
  renderer.setViewState({
    ...viewStateActive,
    zoom,
    target,
    width: clampedSize.width,
    height: clampedSize.height,
  });
  renderer.render();

  try {
    await waitFor(() => renderer.isInitialized(), RENDER_TIMEOUT_MS);

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
    renderer.destroy();
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
