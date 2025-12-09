import { useMemo } from "react";

import { useMeasurements } from "./useMeasurements";
import { select } from "../../state/selectors";
import { useViewerStore } from "../../state/ViewerStoreContext";

export default function ActiveViewStatePreview() {
  const viewStateActive = useViewerStore(select.viewStateActive);
  const viewStatePreview = useViewerStore(select.viewStatePreview);
  const measurementsActive = useMeasurements(viewStateActive);
  const measurementsPreview = useMeasurements(viewStatePreview);

  const { width, height, x, y } = useMemo(() => {
    const scaleFactor =
      2 ** (measurementsPreview.zoom - measurementsActive.zoom);

    return {
      width: measurementsActive.viewPortWidth * scaleFactor,
      height: measurementsActive.viewPortHeight * scaleFactor,
      x:
        measurementsPreview.screenOffsetLeft -
        measurementsActive.screenOffsetLeft * scaleFactor,
      y:
        measurementsPreview.screenOffsetTop -
        measurementsActive.screenOffsetTop * scaleFactor,
    };
  }, [
    measurementsActive.viewPortWidth,
    measurementsActive.viewPortHeight,
    measurementsActive.screenOffsetLeft,
    measurementsActive.screenOffsetTop,
    measurementsActive.zoom,
    measurementsPreview.screenOffsetLeft,
    measurementsPreview.screenOffsetTop,
    measurementsPreview.zoom,
  ]);

  return (
    <svg
      width={measurementsPreview.viewPortWidth}
      height={measurementsPreview.viewPortHeight}
      className="pointer-events-none absolute top-0 left-0"
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        className="fill-none stroke-black stroke-[3]"
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        className="fill-none stroke-white stroke-[1]"
      />
    </svg>
  );
}
