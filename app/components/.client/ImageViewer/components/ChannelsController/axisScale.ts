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
