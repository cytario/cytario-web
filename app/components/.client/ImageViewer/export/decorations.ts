import type { RGB } from "../state/store/types";

/** Millimeters per metadata length unit (NGFF/OME axis units); µm default. */
const MILLIMETERS_PER_UNIT: Record<string, number> = {
  nm: 1e-6,
  µm: 1e-3,
  um: 1e-3,
  mm: 1,
  cm: 10,
  dm: 100,
  m: 1000,
};

export const millimetersPerUnit = (unit: string): number =>
  MILLIMETERS_PER_UNIT[unit.trim().toLowerCase()] ?? 1e-3;

/** The ladder ScaleBar.tsx picks its bar from — [mm, label] pairs, coarse→fine. */
export const METRIC_SIZES: [number, string][] = [
  [100, "10 cm"],
  [50, "5 cm"],
  [20, "2 cm"],
  [10, "1 cm"],
  [5, "5 mm"],
  [2, "2 mm"],
  [1, "1 mm"],
  [0.5, "500 µm"],
  [0.2, "200 µm"],
  [0.1, "100 µm"],
  [0.05, "50 µm"],
  [0.02, "20 µm"],
  [0.01, "10 µm"],
  [0.005, "5 µm"],
  [0.002, "2 µm"],
  [0.001, "1 µm"],
  [0.0005, "500 nm"],
  [0.0002, "200 nm"],
  [0.0001, "100 nm"],
  [0.00005, "50 nm"],
  [0.00002, "20 nm"],
  [0.00001, "10 nm"],
  [0.000005, "5 nm"],
  [0.000002, "2 nm"],
  [0.000001, "1 nm"],
];

export interface ScaleBarGeometry {
  /** Bar width in export pixels. */
  widthPx: number;
  /** Human label for the bar's physical length. */
  label: string;
}

const MAX_BAR_WIDTH_PX = 140;

/** Metric-size ladder pick for a given physical size (mm) of one export pixel. */
export const scaleBarForPixelSize = (millimetersPerPixel: number): ScaleBarGeometry => {
  let index = 0;
  while (
    METRIC_SIZES[index][0] / millimetersPerPixel > MAX_BAR_WIDTH_PX &&
    index <= METRIC_SIZES.length - 2
  ) {
    index++;
  }
  return {
    widthPx: METRIC_SIZES[index][0] / millimetersPerPixel,
    label: METRIC_SIZES[index][1],
  };
};

export interface MagnificationDecoration {
  text: string;
}

/**
 * Magnification text per SRS-CY-33405: objective magnification when the
 * metadata declares it, physical pixel size when it declares only that, or
 * null (omit the decoration) when neither is present.
 */
export const magnificationText = (
  metadata: {
    NominalMagnification?: number;
    Pixels: { PhysicalSizeX?: number; PhysicalSizeXUnit: string };
  } | null,
): MagnificationDecoration | null => {
  if (!metadata) return null;
  if (typeof metadata.NominalMagnification === "number" && metadata.NominalMagnification > 0) {
    return { text: `${metadata.NominalMagnification}×` };
  }
  const physicalSizeX = metadata.Pixels.PhysicalSizeX;
  if (typeof physicalSizeX === "number" && physicalSizeX > 0) {
    const micrometers =
      physicalSizeX * millimetersPerUnit(metadata.Pixels.PhysicalSizeXUnit) * 1000;
    const text = micrometers.toFixed(2).replace(/\.?0+$/, "");
    return { text: `${text} µm/px` };
  }
  return null;
};

/** Letterbox/crop placement around the framed center for a chosen aspect. */
export interface AspectFraming {
  /** Region of the source (full-size) frame to draw: [x, y, w, h]. */
  source: [number, number, number, number];
  /** Region of the output canvas to draw it into: [x, y, w, h]. */
  destination: [number, number, number, number];
  /** Letterbox bars in output pixels to fill around the framed content. */
  letterbox: { top: number; bottom: number; left: number; right: number };
}

export type AspectChoice = "as-viewed" | "16:9" | "4:3";

const ASPECT_RATIOS: Record<Exclude<AspectChoice, "as-viewed">, number> = {
  "16:9": 16 / 9,
  "4:3": 4 / 3,
};

/**
 * Computes the source crop and destination placement when a chosen aspect
 * differs from the framed view's own aspect: crop the longer axis (the
 * content fills the output, losing edge pixels) — never letterbox away
 * content, since a capture is of the framed data, not the viewport chrome.
 */
export const computeAspectFraming = (
  framedWidth: number,
  framedHeight: number,
  aspect: AspectChoice,
): AspectFraming => {
  if (aspect === "as-viewed" || framedWidth <= 0 || framedHeight <= 0) {
    return {
      source: [0, 0, framedWidth, framedHeight],
      destination: [0, 0, framedWidth, framedHeight],
      letterbox: { top: 0, bottom: 0, left: 0, right: 0 },
    };
  }

  const targetRatio = ASPECT_RATIOS[aspect];
  const framedRatio = framedWidth / framedHeight;

  if (framedRatio > targetRatio) {
    // Source is wider than the target — crop width around the center.
    const cropWidth = Math.round(framedHeight * targetRatio);
    const offsetX = Math.round((framedWidth - cropWidth) / 2);
    return {
      source: [offsetX, 0, cropWidth, framedHeight],
      destination: [0, 0, framedWidth, framedHeight],
      letterbox: { top: 0, bottom: 0, left: 0, right: 0 },
    };
  }

  const cropHeight = Math.round(framedWidth / targetRatio);
  const offsetY = Math.round((framedHeight - cropHeight) / 2);
  return {
    source: [0, offsetY, framedWidth, cropHeight],
    destination: [0, 0, framedWidth, framedHeight],
    letterbox: { top: 0, bottom: 0, left: 0, right: 0 },
  };
};

// The export is content, not UI: fixed light styling so a capture is legible
// regardless of the app's theme (which flips with [data-theme]).
const TEXT_COLOR = "rgba(20, 20, 20, 0.9)";
const BACKDROP_COLOR = "rgba(255, 255, 255, 0.75)";
const BAR_COLOR = "rgba(20, 20, 20, 0.9)";
const FONT = "12px Montserrat, system-ui, sans-serif";

const drawBackdrop = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  context.fillStyle = BACKDROP_COLOR;
  context.fillRect(x, y, width, height);
};

export interface ScaleBarDrawOptions {
  /** Physical size (mm) of one export pixel. */
  millimetersPerPixel: number;
}

/** Draws the scale bar decoration into the bottom-left corner of the export. */
export const drawScaleBarDecoration = (
  context: CanvasRenderingContext2D,
  { millimetersPerPixel }: ScaleBarDrawOptions,
): void => {
  const { widthPx, label } = scaleBarForPixelSize(millimetersPerPixel);
  const scale = Math.max(1, Math.round(context.canvas.width / 1920));
  const text = label;
  context.font = `${scale * 12}px Montserrat, system-ui, sans-serif`;
  const textWidth = context.measureText(text).width;
  const padding = 6 * scale;
  const backdropWidth = widthPx + textWidth + 3 * padding;
  const backdropHeight = 12 * scale + 2 * padding;
  const originX = 16 * scale;
  const originY = context.canvas.height - 16 * scale - backdropHeight;

  drawBackdrop(context, originX, originY, backdropWidth, backdropHeight);

  context.fillStyle = BAR_COLOR;
  context.fillRect(originX + padding, originY + padding, widthPx, 3 * scale);
  context.fillStyle = TEXT_COLOR;
  context.textBaseline = "middle";
  context.fillText(text, originX + padding + widthPx + padding, originY + backdropHeight / 2);
};

/** Draws the magnification decoration into the bottom-right corner. */
export const drawMagnificationDecoration = (
  context: CanvasRenderingContext2D,
  text: string,
): void => {
  const scale = Math.max(1, Math.round(context.canvas.width / 1920));
  context.font = FONT;
  const textWidth = context.measureText(text).width;
  const padding = 6 * scale;
  const backdropWidth = textWidth + 2 * padding;
  const backdropHeight = 12 * scale + 2 * padding;
  const originX = context.canvas.width - 16 * scale - backdropWidth;
  const originY = context.canvas.height - 16 * scale - backdropHeight;

  drawBackdrop(context, originX, originY, backdropWidth, backdropHeight);

  context.fillStyle = TEXT_COLOR;
  context.textBaseline = "middle";
  context.fillText(text, originX + padding, originY + backdropHeight / 2 + 1);
};

export interface ChannelLabel {
  name: string;
  color: RGB;
}

/** Draws the channel-labels decoration as a horizontal row of color chips + names. */
export const drawChannelLabelsDecoration = (
  context: CanvasRenderingContext2D,
  labels: ChannelLabel[],
): void => {
  if (labels.length === 0) return;
  const scale = Math.max(1, Math.round(context.canvas.width / 1920));
  context.font = FONT;
  const chipSize = 9 * scale;
  const chipGap = 4 * scale;
  const itemGap = 18 * scale;
  const padding = 6 * scale;
  const labelHeight = 12 * scale + 2 * padding;

  let rowWidth = 0;
  const measured = labels.map(({ name, color }) => {
    const textWidth = context.measureText(name).width;
    const itemWidth = chipSize + chipGap + textWidth;
    rowWidth += itemWidth + itemGap;
    return { name, color, textWidth, itemWidth };
  });
  rowWidth -= itemGap;

  const originX = Math.round((context.canvas.width - rowWidth) / 2);
  const originY = 16 * scale;

  drawBackdrop(context, originX - padding, originY, rowWidth + 2 * padding, labelHeight);

  let cursor = originX;
  for (const { name, color, textWidth } of measured) {
    context.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    context.fillRect(cursor, originY + padding + 1 * scale, chipSize, chipSize);
    context.fillStyle = TEXT_COLOR;
    context.textBaseline = "middle";
    context.fillText(name, cursor + chipSize + chipGap, originY + labelHeight / 2);
    cursor += chipSize + chipGap + textWidth + itemGap;
  }
};

/** Resolves the font (Montserrat web font may not be loaded in a fresh document). */
export const ensureDocumentFonts = async (): Promise<void> => {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts?.ready) await fonts.ready;
};

const SUMMARY_LADDER: [number, string][] = METRIC_SIZES.slice(0, 16);

const SUMMARY_MAX_WIDTH_PX = 140;

/** The resolved scale-bar label for the dialog's summary line, at a given
 *  on-screen zoom and export scale — the ladder pick the bar itself uses. */
export const scaleBarLabelForZoom = ({
  physicalSizeX,
  unit,
  zoom,
  scale,
}: {
  physicalSizeX: number | null;
  unit: string;
  zoom: number;
  scale: number;
}): string | null => {
  if (physicalSizeX === null) return null;
  const mmPerLevel0Px = physicalSizeX * millimetersPerUnit(unit);
  const mmPerExportPx = (mmPerLevel0Px * 2 ** -zoom) / scale;
  for (const [mm, label] of SUMMARY_LADDER) {
    if (mm / mmPerExportPx <= SUMMARY_MAX_WIDTH_PX) return label;
  }
  return SUMMARY_LADDER[SUMMARY_LADDER.length - 1][1];
};
