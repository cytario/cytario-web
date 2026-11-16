/** The viewer's scale bar in CSS px — the on-screen `ScaleBar` (Tailwind) and
 *  the export's canvas renderer both draw this geometry. */
export const SCALE_BAR_LAYOUT = {
  /** Longest the bar may be. */
  maxWidth: 140,
  /** Thickness of the bar's two line segments (`h-0.5`). */
  lineThickness: 2,
  /** Width of the end ticks (`border-x-2`). */
  tickWidth: 2,
  /** Height of the end ticks — the label's line box (`text-xs leading-none`). */
  tickHeight: 12,
  /** Label font size (`text-xs`). */
  fontSize: 12,
  /** Label weight (`MetricText`'s `font-medium`). */
  fontWeight: 500,
  /** Label tracking (`tracking-wider`), in em. */
  letterSpacing: 0.05,
  /** Gap between the label and each line segment (`px-1`). */
  labelPadding: 4,
  /** Padding inside the floating bar (`FloatingBar`'s `p-2`). */
  barPadding: 8,
} as const;

/** Metric ladder — [bar length in mm, label], coarse→fine. */
/** Metric display units, coarse→fine. */
export const METRIC_UNITS = [
  { symbol: "cm", millimeters: 10 },
  { symbol: "mm", millimeters: 1 },
  { symbol: "\u00b5m", millimeters: 1e-3 },
  { symbol: "nm", millimeters: 1e-6 },
] as const;

export type MetricUnit = (typeof METRIC_UNITS)[number];

/** A length in the largest unit that keeps it at least 1 — "128 µm", not
 *  "0.128 mm" — falling back to the finest unit below 1 nm. */
export const formatMetricLength = (
  millimeters: number,
): { value: number; unit: MetricUnit; label: string } => {
  const unit =
    METRIC_UNITS.find(({ millimeters: unitMillimeters }) => millimeters >= unitMillimeters) ??
    METRIC_UNITS[METRIC_UNITS.length - 1];
  // Strip the float noise of the division (0.0005 / 1e-6 = 499.99999999999994).
  const value = Number((millimeters / unit.millimeters).toPrecision(12));
  return { value, unit, label: `${value} ${unit.symbol}` };
};

/** Scale bar steps in millimeters, coarse→fine. */
const METRIC_STEPS = [
  100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001, 0.0005, 0.0002,
  0.0001, 0.00005, 0.00002, 0.00001, 0.000005, 0.000002, 0.000001,
];

const PIXEL_SIZES = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

export interface ScaleBarPick {
  /** Bar width in the caller's pixels, capped at `maxWidth`. */
  width: number;
  label: string;
}

/** The longest metric step that fits `maxWidth`. At extreme zoom even the
 *  finest step (1 nm) overflows, so the width is capped rather than the step. */
export const pickMetricScaleBar = (
  pixelsPerMillimeter: number,
  maxWidth: number = SCALE_BAR_LAYOUT.maxWidth,
): ScaleBarPick => {
  const step =
    METRIC_STEPS.find((millimeters) => millimeters * pixelsPerMillimeter <= maxWidth) ??
    METRIC_STEPS[METRIC_STEPS.length - 1];
  return {
    width: Math.min(step * pixelsPerMillimeter, maxWidth),
    label: formatMetricLength(step).label,
  };
};

/** The longest round number of level-0 image pixels that fits `maxWidth`. */
export const pickPixelScaleBar = (
  pixelsPerImagePixel: number,
  maxWidth: number = SCALE_BAR_LAYOUT.maxWidth,
): ScaleBarPick => {
  const imagePixels = PIXEL_SIZES.find((size) => size * pixelsPerImagePixel <= maxWidth) ?? 1;
  return {
    width: Math.min(imagePixels * pixelsPerImagePixel, maxWidth),
    label: `${imagePixels} px`,
  };
};
