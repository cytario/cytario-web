import { Ruler } from "./Ruler";
import { Scale } from "./Scale";
import { useMeasurements } from "./useMeasurements";

export function Measurements() {
  const {
    viewPortWidth,
    viewPortHeight,
    screenOffsetLeft,
    screenOffsetTop,
    metricOffsetLeft,
    metricOffsetTop,
    metricOffsetRight,
    metricOffsetBottom,
    one_mm,
  } = useMeasurements();

  return (
    <div className="pointer-events-none absolute top-0 left-0 w-full h-full overflow-hidden">
      <Ruler
        size={viewPortWidth}
        min={Math.floor(metricOffsetLeft)}
        max={Math.ceil(metricOffsetRight)}
        offset={screenOffsetLeft}
        one_mm={one_mm}
      />
      <Ruler
        size={viewPortHeight}
        min={Math.floor(metricOffsetTop)}
        max={Math.ceil(metricOffsetBottom)}
        offset={screenOffsetTop}
        one_mm={one_mm}
        vertical
      />

      <Scale />
    </div>
  );
}
