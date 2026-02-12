import { absoluteToMetricFactory, metricToAbsoluteFactory } from "./utils";
import { select } from "../../state/selectors";
import { ViewState } from "../../state/types";
import { useViewerStore } from "../../state/ViewerStoreContext";

export interface UseMeasurementsData {
  /** Image width in mm */
  widthTotalMm: number;
  /** Image height in mm */
  heightTotalMm: number;

  /** Viewport panel container width */
  viewPortWidth: number;
  /** Viewport panel container height */
  viewPortHeight: number;

  /** Projected image width at given zoom level */
  imageWidthScreen: number;
  /** Projected image height at given zoom level */
  imageHeightScreen: number;
  screenOffsetLeft: number;
  screenOffsetRight: number;
  screenOffsetTop: number;
  screenOffsetBottom: number;

  metricOffsetLeft: number;
  metricOffsetTop: number;
  metricOffsetRight: number;
  metricOffsetBottom: number;

  /** Size of one mm at given zoom level in px */
  one_mm: number;

  zoom: number;
  target: [number, number];
}

const measurementsDataInitial: UseMeasurementsData = {
  widthTotalMm: 0,
  heightTotalMm: 0,
  viewPortWidth: 0,
  viewPortHeight: 0,
  imageWidthScreen: 0,
  imageHeightScreen: 0,
  screenOffsetLeft: 0,
  screenOffsetRight: 0,
  screenOffsetTop: 0,
  screenOffsetBottom: 0,
  metricOffsetLeft: 0,
  metricOffsetTop: 0,
  metricOffsetRight: 0,
  metricOffsetBottom: 0,
  one_mm: 0,
  zoom: 0,
  target: [0, 0],
};

const absolutePixelsToScreenPixels = (n = 0, zoom: number) =>
  n / (1 / 2 ** zoom);

const screenPixelsToAbsolutePixels = (n = 0, zoom: number) =>
  n * (1 / 2 ** zoom);

export const useMeasurements = (
  viewStateOptional?: ViewState | null,
): UseMeasurementsData => {
  const viewStateActive = useViewerStore(select.viewStateActive);
  const viewState = viewStateOptional ?? viewStateActive;
  const metadata = useViewerStore(select.metadata);

  if (!viewState || !metadata) {
    return measurementsDataInitial;
  }

  const zoom = viewState.zoom;
  const target = viewState.target;
  const viewPortWidth = viewState.width;
  const viewPortHeight = viewState.height;

  const unit = metadata.Pixels.PhysicalSizeXUnit;

  const absoluteToMetric = absoluteToMetricFactory(
    // TODO: Use a default value from metadata or a sensible default
    metadata.Pixels.PhysicalSizeX ?? 1,
    unit,
  );

  const metricToAbsolute = metricToAbsoluteFactory(
    metadata.Pixels.PhysicalSizeX ?? 1,
    unit,
  );

  const widthTotalMm = absoluteToMetric(metadata.Pixels.SizeX);
  const heightTotalMm = absoluteToMetric(metadata.Pixels.SizeY);

  const imageWidthScreen = absolutePixelsToScreenPixels(
    metadata.Pixels.SizeX,
    zoom,
  );
  const imageHeightScreen = absolutePixelsToScreenPixels(
    metadata.Pixels.SizeY,
    zoom,
  );

  const screenOffsetLeft = -target[0] / (1 / 2 ** zoom) + viewPortWidth / 2;
  const screenOffsetRight = viewPortWidth - screenOffsetLeft;
  const screenOffsetTop = -target[1] / (1 / 2 ** zoom) + viewPortHeight / 2;
  const screenOffsetBottom = viewPortHeight - screenOffsetTop;

  const metricOffsetLeft = absoluteToMetric(
    screenPixelsToAbsolutePixels(-screenOffsetLeft, zoom),
  );
  const metricOffsetTop = absoluteToMetric(
    screenPixelsToAbsolutePixels(-screenOffsetTop, zoom),
  );
  const metricOffsetRight = absoluteToMetric(
    screenPixelsToAbsolutePixels(screenOffsetRight, zoom),
  );
  const metricOffsetBottom = absoluteToMetric(
    screenPixelsToAbsolutePixels(screenOffsetBottom, zoom),
  );

  const one_mm = absolutePixelsToScreenPixels(metricToAbsolute(1), zoom);

  return {
    widthTotalMm,
    heightTotalMm,

    imageWidthScreen,
    imageHeightScreen,

    viewPortWidth,
    viewPortHeight,

    screenOffsetLeft,
    screenOffsetRight,
    screenOffsetTop,
    screenOffsetBottom,

    metricOffsetLeft,
    metricOffsetTop,
    metricOffsetRight,
    metricOffsetBottom,

    one_mm,

    zoom,
    target,
  };
};
