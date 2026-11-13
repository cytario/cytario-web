import {
  capAtNativeResolution,
  fallbackRenderLimits,
  pixelsForDensity,
  type ExportRenderLimits,
} from "./clamp";
import {
  decorationFontPx,
  drawAttributionDecoration,
  drawLegendDecoration,
  drawMagnificationDecoration,
  drawScaleBarDecoration,
  ensureDocumentFonts,
  magnificationText,
  type LegendItem,
} from "./decorations";
import type { ViewerStore } from "../../state/store/types";

export type ExportSource =
  { kind: "current-view" } | { kind: "annotation-region"; featureId: string };

export type ExportDestination = "download" | "clipboard";

export interface ExportDecorations {
  scaleBar: boolean;
  magnification: boolean;
  legend: boolean;
  annotationRegions: boolean;
  attribution: boolean;
}

/** Intent presets: the DPI applies to the image's intended use — half a
 *  screen (web), half a slide (presentation), half a page (print) — never to
 *  the tissue's physical size. The target width follows from the assumed
 *  display width at that density. */
export interface ResolutionPreset {
  id: "web" | "presentation" | "print";
  name: string;
  dpi: number;
  /** Assumed display width in inches for the intended use. */
  displayWidthInches: number;
  /** Target export width in device pixels. */
  targetWidthPx: number;
}

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { id: "web", name: "Web (90 DPI)", dpi: 90, displayWidthInches: 6.7, targetWidthPx: 600 },
  {
    id: "presentation",
    name: "Presentation (300 DPI)",
    dpi: 300,
    displayWidthInches: 6.7,
    targetWidthPx: 2000,
  },
  { id: "print", name: "Print (600 DPI)", dpi: 600, displayWidthInches: 5.8, targetWidthPx: 3500 },
];

export interface ExportViewResult {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  clamped: boolean;
  upscaled: boolean;
}

export class ExportRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportRenderError";
  }
}

/** `image_YYYY-MM-DD-HHmmss` — the capture filename stem. */
export const captureFilename = (imageBasename: string): string => {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, "0");
  const date = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join("-");
  const clock = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join("");
  return `${imageBasename}_${date}-${clock}`;
};

export interface ComposeCaptureInput {
  /** The chosen preset — its DPI sizes the 12 pt font; its target width sizes the output. */
  preset: ResolutionPreset;
  /** Stem for the capture filename (basename + timestamp appended here). */
  imageBasename: string;
  decorations: ExportDecorations;
  /** Level-0 pixel extent the render buffer covers (the framed extent). */
  level0Width: number;
  level0Height: number;
  /** mm per level-0 pixel, from the image's physical pixel size. */
  millimetersPerLevel0Pixel: number;
  /** Acquisition metadata — the magnification source. */
  metadata: { NominalMagnification?: number } | null;
  /** Legend entries: visible channels then enabled overlay markers. */
  legendItems: LegendItem[];
  /** Limits measured at capture time; probed from the environment when omitted. */
  limits?: ExportRenderLimits;
}

/**
 * Composites the settled render buffer into the export PNG: the buffer is the
 * exact framed extent, so it is drawn whole into a destination canvas of the
 * clamped output size (source coords = render buffer, destination coords =
 * output — never mixed), then the decorations are drawn natively at the
 * preset's DPI with one consistent 12 pt font.
 */
export const composeCapture = async (
  canvas: HTMLCanvasElement,
  input: ComposeCaptureInput,
): Promise<ExportViewResult> => {
  if (canvas.width <= 0 || canvas.height <= 0) {
    throw new ExportRenderError("The capture's render buffer is empty.");
  }

  const limits = input.limits ?? fallbackRenderLimits();

  // The preset's target width against the render's own aspect — the intended
  // display size, never the tissue's physical size.
  const targetWidthPx = input.preset.targetWidthPx;
  const targetHeightPx = Math.round((targetWidthPx * canvas.height) / Math.max(canvas.width, 1));
  const sized = pixelsForDensity({
    targetWidthPx,
    targetHeightPx,
    limits,
  });
  const capped = capAtNativeResolution(sized, {
    width: Math.max(input.level0Width, 1),
    height: Math.max(input.level0Height, 1),
  });

  const outputWidth = capped.width;
  const outputHeight = capped.height;

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const context = outputCanvas.getContext("2d");
  if (!context) throw new ExportRenderError("Could not create the export's 2D canvas.");

  context.fillStyle = "rgb(0, 0, 0)";
  context.fillRect(0, 0, outputWidth, outputHeight);
  // The whole buffer is the framed extent: source = render buffer (device px),
  // destination = the output's full size — no aspect crop, no partial quadrant.
  context.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, outputWidth, outputHeight);

  if (
    input.decorations.scaleBar ||
    input.decorations.magnification ||
    input.decorations.attribution ||
    (input.decorations.legend && input.legendItems.length > 0)
  ) {
    await ensureDocumentFonts();
  }

  const fontPx = decorationFontPx(input.preset.dpi);

  if (input.decorations.scaleBar) {
    const millimetersPerPixel =
      input.millimetersPerLevel0Pixel / (canvas.width / input.level0Width);
    drawScaleBarDecoration(context, { millimetersPerPixel, fontPx });
  }
  if (input.decorations.magnification) {
    const magnification = magnificationText(input.metadata);
    if (magnification) drawMagnificationDecoration(context, magnification.text, fontPx);
  }
  if (input.decorations.attribution) {
    drawAttributionDecoration(context, fontPx);
  }
  if (input.decorations.legend) {
    drawLegendDecoration(context, input.legendItems, fontPx);
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    outputCanvas.toBlob((result) => resolve(result), "image/png"),
  );
  if (!blob) throw new ExportRenderError("The captured image could not be encoded as PNG.");

  return {
    blob,
    filename: `${captureFilename(input.imageBasename)}.png`,
    width: outputWidth,
    height: outputHeight,
    clamped: sized.clamped,
    upscaled: capped.upscaled,
  };
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

/** Live access to the viewer store. */
export type ViewerStoreSource = { getState: () => ViewerStore };
