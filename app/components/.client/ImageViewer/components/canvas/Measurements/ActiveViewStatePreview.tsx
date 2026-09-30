import { useMemo } from "react";

import { useMeasurements } from "./useMeasurements";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";

export function ActiveViewStatePreview() {
  const viewStateActive = useViewerStore(select.viewStateActive);
  const viewStatePreview = useViewerStore(select.viewStatePreview);
  const measurementsActive = useMeasurements(viewStateActive);
  const measurementsPreview = useMeasurements(viewStatePreview);

  const { width, height, x, y } = useMemo(() => {
    const scaleFactor = 2 ** (measurementsPreview.zoom - measurementsActive.zoom);

    return {
      width: measurementsActive.viewPortWidth * scaleFactor,
      height: measurementsActive.viewPortHeight * scaleFactor,
      x: measurementsPreview.screenOffsetLeft - measurementsActive.screenOffsetLeft * scaleFactor,
      y: measurementsPreview.screenOffsetTop - measurementsActive.screenOffsetTop * scaleFactor,
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

  // During viewer init one of the two view states can be missing or partial,
  // making the scale/offset arithmetic NaN; skip the overlay rather than feed
  // NaN into SVG attributes (browser logs an error per attribute per render).
  if (
    ![
      x,
      y,
      width,
      height,
      measurementsPreview.viewPortWidth,
      measurementsPreview.viewPortHeight,
    ].every(Number.isFinite)
  ) {
    return null;
  }

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
        // eslint-disable-next-line no-restricted-syntax -- Literal physical color over the scanned image/canvas — not a theme surface.
        className="fill-none stroke-black stroke-[3]"
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        // eslint-disable-next-line no-restricted-syntax -- Literal physical color over the scanned image/canvas — not a theme surface.
        className="fill-none stroke-white stroke-[1]"
      />
    </svg>
  );
}
