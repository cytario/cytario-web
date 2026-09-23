import { MetricText } from "@cytario/design";

import { useMeasurements } from "./useMeasurements";
import { useViewerDisplayStore } from "~/utils/viewerDisplayStore/useViewerDisplayStore";

const METRIC_SIZES: [number, string][] = [
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

const PIXEL_SIZES = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

const maxWidth = 140;

const metricSize = (one_mm: number): [number, string] => {
  let n = 0;
  while (one_mm * METRIC_SIZES[n][0] > maxWidth && n <= METRIC_SIZES.length - 2) n++;
  return [one_mm * METRIC_SIZES[n][0], METRIC_SIZES[n][1]];
};

/** In pixel mode the bar spans a round number of level-0 image pixels. */
const pixelSize = (one_px: number): [number, string] => {
  const px = PIXEL_SIZES.find((n) => n * one_px <= maxWidth) ?? 1;
  return [px * one_px, `${px} px`];
};

export const ScaleBar = () => {
  const { one_mm, zoom } = useMeasurements();
  const displayUnit = useViewerDisplayStore((s) => s.displayUnit);
  const toggleDisplayUnit = useViewerDisplayStore((s) => s.toggleDisplayUnit);

  // At extreme zoom even the smallest ladder step (1 nm / 1 px) exceeds
  // maxWidth — render the bar capped so it can't blow out the canvas corner.
  const [size, unit] = displayUnit === "pixels" ? pixelSize(2 ** zoom) : metricSize(one_mm);
  const width = Math.min(size, maxWidth);

  return (
    <button
      type="button"
      aria-label="Toggle display unit between metric and pixels"
      aria-pressed={displayUnit === "pixels"}
      onClick={toggleDisplayUnit}
      className={`
        flex cursor-pointer items-center
        text-xs font-semibold
        text-muted-foreground
        border-x-2 border-muted-foreground
      `}
      style={{ width }}
    >
      <div className="h-0.5 w-full bg-muted-foreground" />
      <MetricText className="px-1 text-nowrap">{unit}</MetricText>
      <div className="h-0.5 w-full bg-muted-foreground" />
    </button>
  );
};
