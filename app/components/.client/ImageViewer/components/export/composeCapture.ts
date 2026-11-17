import {
  millimetersPerLevel0Pixel,
  millimetersPerOutputPixel,
  type CaptureFrame,
} from "./captureFrame";
import {
  decorationFontPx,
  drawLegendDecoration,
  drawScaleBarDecoration,
  ensureDocumentFonts,
  resolveDecorationTheme,
  decorationInset,
  legendFontPx,
  type Legend,
} from "./decorations";
import type { ViewerStore } from "../../state/store/types";

export type ExportSource =
  { kind: "current-view" } | { kind: "annotation-region"; featureId: string };

export type ExportDestination = "download" | "clipboard";

export interface ExportDecorations {
  scaleBar: boolean;
  legend: boolean;
}

/** Intent presets: each names where the exported image is shown and sizes
 *  the buffer for that display — half a screen (Quick share), half a slide
 *  (Presentation), half a page (Print) — never the tissue's physical size.
 *  The DPI is the density at that intended display size; it sizes the
 *  decoration font, while `dpi × displayWidthInches = targetWidthPx` keeps the
 *  ladder even (1200 → 2000 → 3500). */
export interface ResolutionPreset {
  id: "quick-share" | "presentation" | "print";
  name: string;
  dpi: number;
  /** Assumed display width in inches for the intended use. */
  displayWidthInches: number;
  /** Target export width in device pixels. */
  targetWidthPx: number;
}

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  {
    id: "quick-share",
    name: "Quick share",
    dpi: 180,
    displayWidthInches: 6.7,
    targetWidthPx: 1200,
  },
  {
    id: "presentation",
    name: "Presentation",
    dpi: 300,
    displayWidthInches: 6.7,
    targetWidthPx: 2000,
  },
  { id: "print", name: "Print", dpi: 600, displayWidthInches: 5.8, targetWidthPx: 3500 },
];

export interface ExportViewResult {
  blob: Blob;
  filename: string;
  /** When the capture was taken (`YYYY-MM-DD-HHmmss`) — the filename's suffix. */
  timestamp: string;
  width: number;
  height: number;
  clamped: boolean;
  upscaled: boolean;
  /** Every sampled pixel of the image area is the same color. */
  uniform: boolean;
}

export class ExportRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportRenderError";
  }
}

/** `YYYY-MM-DD-HHmmss` — when a capture was taken. */
export const captureTimestamp = (now: Date = new Date()): string => {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const date = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join("-");
  const clock = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join("");
  return `${date}-${clock}`;
};

/** `image_YYYY-MM-DD-HHmmss` — the capture filename stem. */
export const captureFilename = (
  imageBasename: string,
  timestamp: string = captureTimestamp(),
): string => `${imageBasename}_${timestamp}`;

export interface ComposeCaptureInput {
  /** The chosen preset — its DPI sizes the decoration font. */
  preset: ResolutionPreset;
  /** Stem for the capture filename (basename + timestamp appended here). */
  imageBasename: string;
  decorations: ExportDecorations;
  /** The rendered frame — the deck's buffer is `frame.width × frame.height`. */
  frame: CaptureFrame;
  /** Acquisition metadata — the pixel-size source. */
  metadata: NonNullable<ViewerStore["metadata"]>;
  /** Legend entries: visible channels and enabled overlay markers. */
  legend: Legend;
}

/** True when a sparse sample of the image area is a single color — the
 *  capture rendered nothing but its background (or one flat fill covers
 *  everything). Decorations are excluded: only the image area is sampled. */
const isUniformImage = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean => {
  const image = context.getImageData(0, 0, width, height).data;
  const stepX = Math.max(1, Math.floor(width / 64));
  const stepY = Math.max(1, Math.floor(height / 64));
  const same = (a: number, b: number): boolean =>
    image[a] === image[b] &&
    image[a + 1] === image[b + 1] &&
    image[a + 2] === image[b + 2] &&
    image[a + 3] === image[b + 3];
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const offset = (y * width + x) * 4;
      if (!same(0, offset)) return false;
    }
  }
  return true;
};

/**
 * Composites the settled render buffer into the export PNG: the buffer already
 * is the frame at its output size, so it is copied 1:1 and the decorations are
 * drawn on top at the preset's DPI with one consistent font size.
 */
export const composeCapture = async (
  canvas: HTMLCanvasElement,
  input: ComposeCaptureInput,
): Promise<ExportViewResult> => {
  const { frame } = input;
  if (canvas.width !== frame.width || canvas.height !== frame.height) {
    throw new ExportRenderError(
      `The capture rendered ${canvas.width} × ${canvas.height} px instead of ${frame.width} × ${frame.height} px.`,
    );
  }

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = frame.width;
  outputCanvas.height = frame.height;
  const context = outputCanvas.getContext("2d");
  if (!context) throw new ExportRenderError("Could not create the export's 2D canvas.");

  // The viewer's theme scope the capture deck renders in — the export carries
  // the colors the viewer shows, including behind the slide.
  const theme = resolveDecorationTheme(canvas);
  context.fillStyle = theme.background;
  context.fillRect(0, 0, frame.width, frame.height);
  context.drawImage(canvas, 0, 0);
  // Sampled before the decorations: only the image area decides uniformity.
  const uniform = isUniformImage(context, frame.width, frame.height);

  if (input.decorations.scaleBar || input.decorations.legend) {
    await ensureDocumentFonts();
  }

  const fontPx = decorationFontPx(input.preset.dpi);

  // No physical pixel size, no scale bar: its length would be invented.
  const millimetersPerLevel0 = millimetersPerLevel0Pixel(input.metadata);
  if (input.decorations.scaleBar && millimetersPerLevel0 !== null) {
    const millimetersPerPixel = millimetersPerOutputPixel(frame, millimetersPerLevel0);
    drawScaleBarDecoration(context, { millimetersPerPixel, fontPx, theme });
  }
  if (input.decorations.legend) {
    drawLegendDecoration(
      context,
      input.legend,
      legendFontPx(input.preset.dpi),
      theme,
      decorationInset(fontPx),
    );
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    outputCanvas.toBlob((result) => resolve(result), "image/png"),
  );
  if (!blob) throw new ExportRenderError("The captured image could not be encoded as PNG.");

  const timestamp = captureTimestamp();
  return {
    blob,
    filename: `${captureFilename(input.imageBasename, timestamp)}.png`,
    timestamp,
    width: frame.width,
    height: frame.height,
    clamped: frame.clamped,
    upscaled: frame.upscaled,
    uniform,
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
