// Shared scale math for the channel histogram. Kept React-free so the histogram
// polygon, the contrast slider, and the axis ticks all derive positions from one
// source and stay aligned under either linear or logarithmic scaling.

// Symlog offset for the X axis. A plain log(v + 1) is far too steep near zero over
// a 16-bit range; offsetting by a fraction of the range keeps the low end
// quasi-linear so the axis stays readable.
export function logXOffset(range: number): number {
  return range / 100;
}

// Intensity value -> normalized position in [0, 1].
export function intensityToRatio(intensity: number, range: number, logScaleX: boolean): number {
  if (range <= 0) return 0;
  if (!logScaleX) return intensity / range;
  const c = logXOffset(range);
  return (Math.log(intensity + c) - Math.log(c)) / (Math.log(range + c) - Math.log(c));
}

// Normalized position in [0, 1] -> intensity value. Inverse of intensityToRatio.
export function ratioToIntensity(ratio: number, range: number, logScaleX: boolean): number {
  if (range <= 0) return 0;
  if (!logScaleX) return ratio * range;
  const c = logXOffset(range);
  return c * ((range + c) / c) ** ratio - c;
}

// Bin count -> normalized height in [0, 1], clamped. Log keeps the sparse signal
// tail visible above the dominant background mode.
export function countToRatio(value: number, maxValue: number, logScaleY: boolean): number {
  const scaled = logScaleY ? Math.log(value + 1) : value;
  const scaledMax = logScaleY ? Math.log(maxValue + 1) : maxValue;
  return scaledMax > 0 ? Math.min(1, scaled / scaledMax) : 0;
}

// Inverse of countToRatio.
export function ratioToCount(ratio: number, maxValue: number, logScaleY: boolean): number {
  if (logScaleY) return (maxValue + 1) ** ratio - 1;
  return ratio * maxValue;
}

// --- Tick generation (shared by both axes) ---

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const nice = norm <= 1.5 ? 1 : norm <= 3 ? 2 : norm <= 7 ? 5 : 10;
  return nice * mag;
}

export function generateTicks(max: number, log: boolean, includeZero = true): number[] {
  if (max <= 0) return [0];
  if (log) {
    const ticks = includeZero ? [0] : [];
    const start = max > 10000 ? 1000 : max > 1000 ? 100 : max > 100 ? 10 : 1;
    for (let p = start; p <= max; p *= 10) ticks.push(p);
    return ticks;
  }
  const step = niceStep(max / 4);
  const ticks: number[] = [];
  for (let v = includeZero ? 0 : step; v <= max; v += step) ticks.push(v);
  return ticks;
}

export function formatTick(v: number): string {
  return v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)}M`
    : v >= 1000
      ? `${(v / 1000).toFixed(1)}k`
      : String(v);
}
