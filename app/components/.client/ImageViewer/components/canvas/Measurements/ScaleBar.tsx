import { MetricText } from "@cytario/design";

import { useMeasurements } from "./useMeasurements";
import { SCALE_BAR_METRIC_SIZES as METRIC_SIZES } from "./utils";
import { useViewerDisplayStore } from "~/utils/viewerDisplayStore/useViewerDisplayStore";

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
