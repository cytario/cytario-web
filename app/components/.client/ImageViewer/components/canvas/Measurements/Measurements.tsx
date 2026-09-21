import { Ruler } from "./Ruler";
import { useMeasurements } from "./useMeasurements";
import { useDisplayUnitStore } from "~/utils/displayUnitStore/useDisplayUnitStore";

const PIXEL_LADDER = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

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
    zoom,
  } = useMeasurements();
  const displayUnit = useDisplayUnitStore((s) => s.displayUnit);

  if (displayUnit === "pixels") {
    // Tick blocks of `blockSize` level-0 px, sized so ticks stay legible at any zoom.
    const onePxScreen = 2 ** zoom;
    const blockSize =
      PIXEL_LADDER.find((n) => n * onePxScreen >= 50) ?? PIXEL_LADDER[PIXEL_LADDER.length - 1];
    return (
      <div className="pointer-events-none absolute top-0 left-0 w-full h-full overflow-hidden">
        <Ruler
          size={viewPortWidth}
          min={Math.floor(-screenOffsetLeft / onePxScreen / blockSize)}
          max={Math.ceil((viewPortWidth - screenOffsetLeft) / onePxScreen / blockSize)}
          offset={screenOffsetLeft}
          spacing={blockSize * onePxScreen}
          labelScale={blockSize}
        />
        <Ruler
          size={viewPortHeight}
          min={Math.floor(-screenOffsetTop / onePxScreen / blockSize)}
          max={Math.ceil((viewPortHeight - screenOffsetTop) / onePxScreen / blockSize)}
          offset={screenOffsetTop}
          spacing={blockSize * onePxScreen}
          labelScale={blockSize}
          vertical
        />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute top-0 left-0 w-full h-full overflow-hidden">
      <Ruler
        size={viewPortWidth}
        min={Math.floor(metricOffsetLeft)}
        max={Math.ceil(metricOffsetRight)}
        offset={screenOffsetLeft}
        spacing={one_mm}
      />
      <Ruler
        size={viewPortHeight}
        min={Math.floor(metricOffsetTop)}
        max={Math.ceil(metricOffsetBottom)}
        offset={screenOffsetTop}
        spacing={one_mm}
        vertical
      />
    </div>
  );
}
