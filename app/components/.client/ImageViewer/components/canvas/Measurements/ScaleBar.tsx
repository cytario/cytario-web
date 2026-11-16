import { MetricText } from "@cytario/design";

import { pickMetricScaleBar, pickPixelScaleBar, SCALE_BAR_LAYOUT } from "./scaleBarGeometry";
import { useDisplayScale } from "./useDisplayScale";
import { useMeasurements } from "./useMeasurements";
import { useViewerDisplayStore } from "~/utils/viewerDisplayStore/useViewerDisplayStore";

export const ScaleBar = () => {
  const { zoom } = useMeasurements();
  const scale = useDisplayScale();
  const toggleDisplayUnit = useViewerDisplayStore((s) => s.toggleDisplayUnit);

  const { width, label } =
    scale.unit === "metric"
      ? pickMetricScaleBar(2 ** zoom / scale.pixelSize.x)
      : pickPixelScaleBar(2 ** zoom);
  const canToggle = scale.unit === "metric" || scale.metricAvailable;

  // The classes mirror SCALE_BAR_LAYOUT, which the export draws from.
  return (
    <button
      type="button"
      aria-label="Toggle display unit between metric and pixels"
      aria-pressed={scale.unit === "pixels"}
      disabled={!canToggle}
      title={canToggle ? undefined : "This image has no physical pixel size"}
      onClick={toggleDisplayUnit}
      className={`
        flex cursor-pointer items-center disabled:cursor-default
        text-xs font-semibold
        text-muted-foreground
        border-x-2 border-muted-foreground
      `}
      style={{ width, maxWidth: SCALE_BAR_LAYOUT.maxWidth }}
    >
      <div className="h-0.5 w-full bg-muted-foreground" />
      <MetricText className="px-1 text-nowrap">{label}</MetricText>
      <div className="h-0.5 w-full bg-muted-foreground" />
    </button>
  );
};
