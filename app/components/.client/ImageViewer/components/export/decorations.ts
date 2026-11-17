import type { RGB, RGBA } from "../../state/store/types";
import { pickMetricScaleBar, SCALE_BAR_LAYOUT } from "../canvas/Measurements/scaleBarGeometry";

const POINTS_PER_INCH = 72;
/** Decoration text size — within the 5–8 pt journals ask for in figures. */
const DECORATION_POINT_SIZE = 7;
/** The legend reads as the figure's key, so it is set larger than the rest. */
const LEGEND_POINT_SIZE = 9;
// Mirrors Tailwind's `shadow-md` under the viewer's floating bars.
const FLOATING_BAR_SHADOW = "rgb(0 0 0 / 0.1)";
const FLOATING_BAR_OPACITY = 0.8;
/** Distance of every decoration from the image border, in viewer CSS px. */
const EXPORT_INSET = 12;
/** Legend row spacing and divider, in viewer CSS px. */
const LEGEND_ROW_GAP = 8;
const LEGEND_DIVIDER_THICKNESS = 1;

/** One font size across every decoration: decoration text is drawn in output
 *  pixels, so the pixel size of a point comes from the export's own DPI preset. */
export const decorationFontPx = (dpi: number): number =>
  (DECORATION_POINT_SIZE * dpi) / POINTS_PER_INCH;

/** The legend's font size at the export's DPI preset. */
export const legendFontPx = (dpi: number): number => (LEGEND_POINT_SIZE * dpi) / POINTS_PER_INCH;

/** The viewer's theme tokens as canvas colors, plus its font stack. */
export interface DecorationTheme {
  background: string;
  foreground: string;
  mutedForeground: string;
  fontFamily: string;
}

const tokenValue = (style: CSSStyleDeclaration, token: string, fallback: string): string =>
  style.getPropertyValue(token).trim() || fallback;

/** Resolves the decoration theme from the theme scope `element` renders in, so
 *  the export carries the viewer's own colors (dark over brightfield tissue). */
export const resolveDecorationTheme = (element: Element): DecorationTheme => {
  const style = getComputedStyle(element);
  return {
    background: tokenValue(style, "--color-background", "Canvas"),
    foreground: tokenValue(style, "--color-foreground", "CanvasText"),
    mutedForeground: tokenValue(style, "--color-muted-foreground", "GrayText"),
    fontFamily: style.fontFamily || "system-ui, sans-serif",
  };
};

/** Output px per viewer CSS px: the viewer's 12 px label maps onto the
 *  decoration font, so every decoration keeps the viewer's proportions. */
const layoutScale = (fontPx: number): number => fontPx / SCALE_BAR_LAYOUT.fontSize;

/** Output px per viewer CSS px at a DPI preset — the scale every
 *  pixel-sized mark of the export (decorations, annotation lines) is drawn at. */
export const outputPixelsPerViewerPixel = (dpi: number): number =>
  layoutScale(decorationFontPx(dpi));

/** Size and placement shared by every floating bar, in output px. */
const floatingBarMetrics = (fontPx: number) => {
  const scale = layoutScale(fontPx);
  const padding = SCALE_BAR_LAYOUT.barPadding * scale;
  const contentHeight = SCALE_BAR_LAYOUT.tickHeight * scale;
  return {
    scale,
    padding,
    contentHeight,
    height: contentHeight + 2 * padding,
    offset: EXPORT_INSET * scale,
  };
};

/** The viewer's `FloatingBar`: a fully rounded pill, `bg-background/80`, `shadow-md`.
 *  `roundRect` is feature-tested so an engine without it (Firefox < 112)
 *  cannot throw inside the compose — the plain rect reads as a square pill. */
const drawFloatingBar = (
  context: CanvasRenderingContext2D,
  theme: DecorationTheme,
  scale: number,
  [x, y, width, height]: [number, number, number, number],
  radius: number = height / 2,
): void => {
  context.save();
  context.globalAlpha = FLOATING_BAR_OPACITY;
  context.shadowColor = FLOATING_BAR_SHADOW;
  context.shadowBlur = 6 * scale;
  context.shadowOffsetY = 4 * scale;
  context.fillStyle = theme.background;
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, radius);
  } else {
    context.rect(x, y, width, height);
  }
  context.fill();
  context.restore();
};

const setLabelFont = (
  context: CanvasRenderingContext2D,
  theme: DecorationTheme,
  fontPx: number,
): void => {
  context.font = `${SCALE_BAR_LAYOUT.fontWeight} ${fontPx}px ${theme.fontFamily}`;
  // letterSpacing is unsupported in Firefox — assigning it is a silent no-op
  // there, and the check keeps the layout from silently depending on it.
  if ("letterSpacing" in context) {
    context.letterSpacing = `${SCALE_BAR_LAYOUT.letterSpacing * fontPx}px`;
  }
  context.textBaseline = "middle";
};

/** The scale bar the export draws: the viewer's step pick with the viewer's
 *  maximum width, in output px. */
export const exportScaleBar = (millimetersPerPixel: number, fontPx: number) =>
  pickMetricScaleBar(1 / millimetersPerPixel, SCALE_BAR_LAYOUT.maxWidth * layoutScale(fontPx));

export interface ScaleBarDrawOptions {
  /** Physical size (mm) of one export pixel. */
  millimetersPerPixel: number;
  /** The export's DPI preset — sizes the decoration text. */
  fontPx: number;
  theme: DecorationTheme;
}

/** Draws the viewer's scale bar — end ticks, two line segments, the label
 *  centred between them — in its floating bar in the bottom-left corner. */
export const drawScaleBarDecoration = (
  context: CanvasRenderingContext2D,
  { millimetersPerPixel, fontPx, theme }: ScaleBarDrawOptions,
): void => {
  const { width, label } = exportScaleBar(millimetersPerPixel, fontPx);
  const { scale, padding, contentHeight, height, offset } = floatingBarMetrics(fontPx);
  const barX = offset;
  const barY = context.canvas.height - offset - height;
  drawFloatingBar(context, theme, scale, [barX, barY, width + 2 * padding, height]);

  const left = barX + padding;
  const top = barY + padding;
  const centerY = top + contentHeight / 2;
  const tickWidth = SCALE_BAR_LAYOUT.tickWidth * scale;
  const lineThickness = SCALE_BAR_LAYOUT.lineThickness * scale;
  const labelPadding = SCALE_BAR_LAYOUT.labelPadding * scale;

  setLabelFont(context, theme, fontPx);
  const labelWidth = context.measureText(label).width;
  const lineWidth = Math.max(0, (width - 2 * tickWidth - labelWidth - 2 * labelPadding) / 2);

  context.fillStyle = theme.mutedForeground;
  context.fillRect(left, top, tickWidth, contentHeight);
  context.fillRect(left + width - tickWidth, top, tickWidth, contentHeight);
  context.fillRect(left + tickWidth, centerY - lineThickness / 2, lineWidth, lineThickness);
  context.fillRect(
    left + width - tickWidth - lineWidth,
    centerY - lineThickness / 2,
    lineWidth,
    lineThickness,
  );
  context.textAlign = "center";
  context.fillText(label, left + width / 2, centerY);
  context.textAlign = "start";
};

export interface LegendItem {
  /** Display name of the channel or overlay marker. */
  name: string;
  /** Its assigned pseudo-color / marker color. */
  color: RGB | RGBA;
}

/** The legend's two groups: visible channels and enabled overlay markers. */
export interface Legend {
  channels: LegendItem[];
  overlays: LegendItem[];
}

/** Distance of every decoration from the image border, in output px. */
export const decorationInset = (fontPx: number): number => floatingBarMetrics(fontPx).offset;

/** Draws the legend as a vertical list of color chips + names in the
 *  bottom-right corner — channels, a divider, then overlay markers. `inset`
 *  is the other decorations' border distance, so the corners line up although
 *  the legend's font is larger. */
export const drawLegendDecoration = (
  context: CanvasRenderingContext2D,
  { channels, overlays }: Legend,
  fontPx: number,
  theme: DecorationTheme,
  inset: number = floatingBarMetrics(fontPx).offset,
): void => {
  const { scale, padding, contentHeight, height: pillHeight } = floatingBarMetrics(fontPx);
  const groups = [channels, overlays].filter((group) => group.length > 0);
  if (groups.length === 0) return;

  setLabelFont(context, theme, fontPx);
  const chipSize = fontPx * 0.75;
  const chipGap = fontPx / 3;
  const rowGap = LEGEND_ROW_GAP * scale;
  const dividerThickness = LEGEND_DIVIDER_THICKNESS * scale;

  const contentWidth = Math.max(
    ...groups.flat().map(({ name }) => chipSize + chipGap + context.measureText(name).width),
  );
  const rowCount = groups.flat().length;
  const dividerSpace = (groups.length - 1) * (dividerThickness + rowGap);
  const contentBlockHeight = rowCount * contentHeight + (rowCount - 1) * rowGap + dividerSpace;

  const boxWidth = contentWidth + 2 * padding;
  const boxHeight = contentBlockHeight + 2 * padding;
  const boxX = context.canvas.width - inset - boxWidth;
  const boxY = context.canvas.height - inset - boxHeight;
  // Corners match the single-row floating bars beside it.
  drawFloatingBar(context, theme, scale, [boxX, boxY, boxWidth, boxHeight], pillHeight / 2);

  const left = boxX + padding;
  let rowTop = boxY + padding;
  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      context.fillStyle = theme.mutedForeground;
      context.fillRect(left, rowTop, contentWidth, dividerThickness);
      rowTop += dividerThickness + rowGap;
    }
    for (const { name, color } of group) {
      const centerY = rowTop + contentHeight / 2;
      context.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
      context.fillRect(left, centerY - chipSize / 2, chipSize, chipSize);
      context.fillStyle = theme.foreground;
      context.fillText(name, left + chipSize + chipGap, centerY);
      rowTop += contentHeight + rowGap;
    }
  });
};

/** Resolves the font (Montserrat web font may not be loaded in a fresh document). */
export const ensureDocumentFonts = async (): Promise<void> => {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts?.ready) await fonts.ready;
};
