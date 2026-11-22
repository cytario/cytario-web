import type { RGB, RGBA } from "../../state/store/types";
import { pickMetricScaleBar, SCALE_BAR_LAYOUT } from "../canvas/Measurements/scaleBarGeometry";

const POINTS_PER_INCH = 72;
/** Decoration text size — within the 5–8 pt journals ask for in figures. */
const DECORATION_POINT_SIZE = 7;
/** The legend reads as the figure's key, so it is set larger than the rest. */
const LEGEND_POINT_SIZE = 9;
/** Smallest the legend shrinks to before it drops entries. */
const MIN_LEGEND_POINT_SIZE = 5;
const LEGEND_SHRINK_STEP = 0.9;
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
  // letterSpacing is a silent no-op on Firefox — feature-test so the
  // layout never depends on it.
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
 *  centred between them — in its floating bar in the bottom-left corner.
 *  Returns the bar's right edge, in output px. */
export const drawScaleBarDecoration = (
  context: CanvasRenderingContext2D,
  { millimetersPerPixel, fontPx, theme }: ScaleBarDrawOptions,
): number => {
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
  return barX + width + 2 * padding;
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

type LegendRow = { kind: "item"; item: LegendItem } | { kind: "divider" };

interface PlacedRowPosition {
  column: number;
  /** Top of the row, relative to the content box. */
  top: number;
}

type PlacedLegendRow = PlacedRowPosition &
  (
    | {
        kind: "item";
        item: LegendItem;
        /** Name as drawn — ellipsized to the column. */ text: string;
      }
    | { kind: "divider" }
    | { kind: "more"; text: string }
  );

interface LegendLayout {
  fontPx: number;
  columnCount: number;
  columnWidth: number;
  contentHeight: number;
  rows: PlacedLegendRow[];
  /** Entries left out because they did not fit even at the smallest size. */
  omitted: number;
}

const legendMetrics = (fontPx: number) => {
  const { scale, padding, contentHeight: rowHeight } = floatingBarMetrics(fontPx);
  return {
    padding,
    rowHeight,
    rowGap: LEGEND_ROW_GAP * scale,
    dividerThickness: LEGEND_DIVIDER_THICKNESS * scale,
    chipSize: fontPx * 0.75,
    chipGap: fontPx / 3,
    columnGap: 2 * padding,
  };
};

/** Shortens `text` with an ellipsis until `measure` fits it in `maxWidth`. */
const ellipsize = (text: string, maxWidth: number, measure: (text: string) => number): string => {
  if (measure(text) <= maxWidth) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(`${text.slice(0, mid)}…`) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return `${text.slice(0, low)}…`;
};

/** Lays the rows out in equal-width columns filled top to bottom within
 *  `maxWidth × maxHeight` at one font size. With `truncate`, rows that do not
 *  fit are replaced by a "+N more" row; without it, an overflow yields null. */
const layoutLegendAt = (
  rows: LegendRow[],
  fontPx: number,
  maxWidth: number,
  maxHeight: number,
  measure: (text: string, fontPx: number) => number,
  truncate: boolean,
): LegendLayout | null => {
  const { padding, rowHeight, rowGap, dividerThickness, chipSize, chipGap, columnGap } =
    legendMetrics(fontPx);
  const availableWidth = maxWidth - 2 * padding;
  const availableHeight = maxHeight - 2 * padding;
  if (availableWidth <= chipSize + chipGap || availableHeight < rowHeight) return null;

  const measureAt = (text: string) => measure(text, fontPx);
  const itemWidths = rows.map((row) =>
    row.kind === "item" ? chipSize + chipGap + measureAt(row.item.name) : 0,
  );
  const totalItems = rows.filter((row) => row.kind === "item").length;
  // When truncating, the column must also hold the "+N more" label.
  const moreWidth = truncate ? measureAt(`+${totalItems} more`) : 0;
  const columnWidth = Math.min(Math.max(...itemWidths, moreWidth), availableWidth);
  const maxColumns = Math.max(
    1,
    Math.floor((availableWidth + columnGap) / (columnWidth + columnGap)),
  );
  const labelWidth = columnWidth - chipSize - chipGap;

  const placed: PlacedLegendRow[] = [];
  let column = 0;
  let columnHeight = 0;
  let contentHeight = 0;
  let overflowAt = -1;

  for (const [index, row] of rows.entries()) {
    const height = row.kind === "item" ? rowHeight : dividerThickness;
    // A divider at a column break separates nothing.
    if (row.kind === "divider" && columnHeight === 0) continue;
    if (columnHeight + (columnHeight > 0 ? rowGap : 0) + height > availableHeight) {
      if (row.kind === "divider") continue;
      if (column + 1 >= maxColumns) {
        overflowAt = index;
        break;
      }
      column += 1;
      columnHeight = 0;
    }
    const top = columnHeight + (columnHeight > 0 ? rowGap : 0);
    placed.push(
      row.kind === "item"
        ? {
            kind: "item",
            item: row.item,
            text: ellipsize(row.item.name, labelWidth, measureAt),
            column,
            top,
          }
        : { kind: "divider", column, top },
    );
    columnHeight = top + height;
    contentHeight = Math.max(contentHeight, columnHeight);
  }

  let omitted = 0;
  if (overflowAt >= 0) {
    if (!truncate) return null;
    // The last slot reports what was left out.
    while (placed.length > 0 && placed[placed.length - 1].kind === "divider") placed.pop();
    const replaced = placed.pop();
    const shownItems = placed.filter((row) => row.kind === "item").length;
    omitted = totalItems - shownItems;
    if (!replaced) return null;
    placed.push({
      kind: "more",
      text: ellipsize(`+${omitted} more`, columnWidth, measureAt),
      column: replaced.column,
      top: replaced.top,
    });
  }

  return {
    fontPx,
    columnCount: column + 1,
    columnWidth,
    contentHeight,
    rows: placed,
    omitted,
  };
};

/** Fits the legend into `maxWidth × maxHeight`: the full font in one column
 *  when it fits, else more columns, then a smaller font down to the minimum,
 *  and only then a "+N more" row for what still does not fit. */
export const layoutLegend = (
  { channels, overlays }: Legend,
  fontPx: number,
  maxWidth: number,
  maxHeight: number,
  measure: (text: string, fontPx: number) => number,
): LegendLayout | null => {
  const groups = [channels, overlays].filter((group) => group.length > 0);
  if (groups.length === 0) return null;
  const rows: LegendRow[] = groups.flatMap((group, index) => [
    ...(index > 0 ? [{ kind: "divider" as const }] : []),
    ...group.map((item) => ({ kind: "item" as const, item })),
  ]);

  const minFontPx = (fontPx * MIN_LEGEND_POINT_SIZE) / LEGEND_POINT_SIZE;
  for (let size = fontPx; size > minFontPx; size *= LEGEND_SHRINK_STEP) {
    const layout = layoutLegendAt(rows, size, maxWidth, maxHeight, measure, false);
    if (layout) return layout;
  }
  return layoutLegendAt(rows, minFontPx, maxWidth, maxHeight, measure, true);
};

export interface LegendDrawOptions {
  /** The legend's full font size; it shrinks from here only to fit. */
  fontPx: number;
  theme: DecorationTheme;
  /** Distance from the image border — the other decorations' inset. */
  inset?: number;
  /** Leftmost x the legend may reach — the right edge of the scale bar. */
  minX?: number;
}

/** Draws the legend in the bottom-right corner as columns of color chips and
 *  names — channels, a divider, then overlay markers — fitted to the image.
 *  Returns the number of entries left out. */
export const drawLegendDecoration = (
  context: CanvasRenderingContext2D,
  legend: Legend,
  { fontPx, theme, inset = floatingBarMetrics(fontPx).offset, minX = 0 }: LegendDrawOptions,
): number => {
  const itemCount = legend.channels.length + legend.overlays.length;
  if (itemCount === 0) return 0;

  const maxWidth = context.canvas.width - inset - Math.max(inset, minX + inset);
  const maxHeight = context.canvas.height - 2 * inset;
  const measure = (text: string, size: number) => {
    setLabelFont(context, theme, size);
    return context.measureText(text).width;
  };
  const layout = layoutLegend(legend, fontPx, maxWidth, maxHeight, measure);
  if (!layout) return itemCount;

  const { padding, chipSize, chipGap, columnGap, dividerThickness, rowHeight } = legendMetrics(
    layout.fontPx,
  );
  const { scale, height: pillHeight } = floatingBarMetrics(layout.fontPx);
  const boxWidth =
    layout.columnCount * layout.columnWidth + (layout.columnCount - 1) * columnGap + 2 * padding;
  const boxHeight = layout.contentHeight + 2 * padding;
  const boxX = context.canvas.width - inset - boxWidth;
  const boxY = context.canvas.height - inset - boxHeight;
  // Corners match the single-row floating bars beside it.
  drawFloatingBar(context, theme, scale, [boxX, boxY, boxWidth, boxHeight], pillHeight / 2);

  setLabelFont(context, theme, layout.fontPx);
  for (const row of layout.rows) {
    const left = boxX + padding + row.column * (layout.columnWidth + columnGap);
    const top = boxY + padding + row.top;
    if (row.kind === "divider") {
      context.fillStyle = theme.mutedForeground;
      context.fillRect(left, top, layout.columnWidth, dividerThickness);
      continue;
    }
    const centerY = top + rowHeight / 2;
    if (row.kind === "more") {
      context.fillStyle = theme.mutedForeground;
      context.fillText(row.text, left, centerY);
      continue;
    }
    const [red, green, blue] = row.item.color;
    context.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    context.fillRect(left, centerY - chipSize / 2, chipSize, chipSize);
    context.fillStyle = theme.foreground;
    context.fillText(row.text, left + chipSize + chipGap, centerY);
  }
  return layout.omitted;
};

/** Resolves the font (Montserrat web font may not be loaded in a fresh document). */
export const ensureDocumentFonts = async (): Promise<void> => {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts?.ready) await fonts.ready;
};
