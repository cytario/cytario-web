import type { RGB, RGBA } from "../../state/store/types";
import { SCALE_BAR_METRIC_SIZES as METRIC_SIZES } from "../canvas/Measurements/utils";

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

/** The magnification decoration, from the objective magnification declared in
 *  acquisition metadata only — omitted when the metadata declares none. */
export const magnificationText = (
  metadata: { NominalMagnification?: number } | null,
): { text: string } | null => {
  if (!metadata) return null;
  if (typeof metadata.NominalMagnification === "number" && metadata.NominalMagnification > 0) {
    return { text: `${metadata.NominalMagnification}×` };
  }
  return null;
};

// The export is content, not UI: fixed light styling so a capture is legible
// regardless of the app's theme (which flips with [data-theme]).
const TEXT_COLOR = "rgba(20, 20, 20, 0.9)";
const BACKDROP_COLOR = "rgba(255, 255, 255, 0.75)";
const BAR_COLOR = "rgba(20, 20, 20, 0.9)";
const POINTS_PER_INCH = 72;

/** One 12 pt font across every decoration: decoration text is drawn in output
 *  pixels, so the pixel size of a point comes from the export's own DPI preset. */
export const decorationFontPx = (dpi: number): number => (12 * dpi) / POINTS_PER_INCH;

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
  /** The export's DPI preset — sizes the 12 pt text. */
  fontPx: number;
}

/** Draws the scale bar decoration into the bottom-left corner of the export. */
export const drawScaleBarDecoration = (
  context: CanvasRenderingContext2D,
  { millimetersPerPixel, fontPx }: ScaleBarDrawOptions,
): void => {
  const { widthPx, label } = scaleBarForPixelSize(millimetersPerPixel);
  const padding = fontPx / 2;
  context.font = `${fontPx}px Montserrat, system-ui, sans-serif`;
  const textWidth = context.measureText(label).width;
  const barHeight = fontPx / 4;
  const backdropWidth = widthPx + textWidth + 3 * padding;
  const backdropHeight = fontPx + 2 * padding;
  const originX = padding * 2.5;
  const originY = context.canvas.height - padding * 2.5 - backdropHeight;

  drawBackdrop(context, originX, originY, backdropWidth, backdropHeight);

  context.fillStyle = BAR_COLOR;
  context.fillRect(originX + padding, originY + padding, widthPx, barHeight);
  context.fillStyle = TEXT_COLOR;
  context.textBaseline = "middle";
  context.fillText(label, originX + padding + widthPx + padding, originY + backdropHeight / 2);
};

/** Draws the magnification decoration into the bottom-right corner. */
export const drawMagnificationDecoration = (
  context: CanvasRenderingContext2D,
  text: string,
  fontPx: number,
): void => {
  const padding = fontPx / 2;
  context.font = `${fontPx}px Montserrat, system-ui, sans-serif`;
  const textWidth = context.measureText(text).width;
  const backdropWidth = textWidth + 2 * padding;
  const backdropHeight = fontPx + 2 * padding;
  const originX = context.canvas.width - padding * 2.5 - backdropWidth;
  const originY = context.canvas.height - padding * 2.5 - backdropHeight;

  drawBackdrop(context, originX, originY, backdropWidth, backdropHeight);

  context.fillStyle = TEXT_COLOR;
  context.textBaseline = "middle";
  context.fillText(text, originX + padding, originY + backdropHeight / 2 + 1);
};

export interface LegendItem {
  /** Display name of the channel or overlay marker. */
  name: string;
  /** Its assigned pseudo-color / marker color. */
  color: RGB | RGBA;
}

/** Draws the channel and overlay legend as a horizontal row of color chips +
 *  names across the top of the export — each visible channel followed by each
 *  enabled overlay marker, in their assigned colors. */
export const drawLegendDecoration = (
  context: CanvasRenderingContext2D,
  items: LegendItem[],
  fontPx: number,
): void => {
  if (items.length === 0) return;
  context.font = `${fontPx}px Montserrat, system-ui, sans-serif`;
  const chipSize = fontPx * 0.75;
  const chipGap = fontPx / 3;
  const itemGap = fontPx * 1.5;
  const padding = fontPx / 2;
  const rowHeight = fontPx + 2 * padding;

  let rowWidth = 0;
  const measured = items.map(({ name, color }) => {
    const textWidth = context.measureText(name).width;
    const itemWidth = chipSize + chipGap + textWidth;
    rowWidth += itemWidth + itemGap;
    return { name, color, textWidth, itemWidth };
  });
  rowWidth -= itemGap;

  const originX = Math.round((context.canvas.width - rowWidth) / 2);
  const originY = padding * 2.5;

  drawBackdrop(context, originX - padding, originY, rowWidth + 2 * padding, rowHeight);

  let cursor = originX;
  for (const { name, color, textWidth } of measured) {
    context.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    context.fillRect(cursor, originY + padding, chipSize, chipSize);
    context.fillStyle = TEXT_COLOR;
    context.textBaseline = "middle";
    context.fillText(name, cursor + chipSize + chipGap, originY + rowHeight / 2);
    cursor += chipSize + chipGap + textWidth + itemGap;
  }
};

/** Resolves the font (Montserrat web font may not be loaded in a fresh document). */
export const ensureDocumentFonts = async (): Promise<void> => {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts?.ready) await fonts.ready;
};

/** The resolved scale-bar label for the summary line — the same ladder pick
 *  the drawn bar uses, at the export's mm-per-pixel. */
export const scaleBarLabelForPixelSize = (millimetersPerPixel: number): string | null => {
  if (millimetersPerPixel <= 0) return null;
  return scaleBarForPixelSize(millimetersPerPixel).label;
};
