import { Tick } from "./Tick";
import { useMeasurements } from "./useMeasurements";
import { absoluteToMetricFactory } from "./utils";
import { select } from "../../state/selectors";
import { useViewerStore } from "../../state/ViewerStoreContext";

export const CursorTick = ({ vertical }: { vertical?: boolean }) => {
  const { zoom, screenOffsetLeft, screenOffsetTop } = useMeasurements();
  const metadata = useViewerStore(select.metadata);
  const cursorPosition = useViewerStore(select.cursorPosition);

  if (!cursorPosition) return null;
  if (!metadata) return null;

  const x = cursorPosition.x - 0;
  const y = cursorPosition.y - 0;

  // Convert screen coordinates to absolute pixels
  const screenPixelsToAbsolutePixels = (n: number) => n * (1 / 2 ** zoom);

  // Convert absolute pixels to metric units
  const unit = metadata.Pixels.PhysicalSizeXUnit;
  const absoluteToMetric = absoluteToMetricFactory(
    metadata.Pixels.PhysicalSizeX ?? 1,
    unit
  );

  // Calculate metric position
  const absoluteX = screenPixelsToAbsolutePixels(x - screenOffsetLeft);
  const absoluteY = screenPixelsToAbsolutePixels(y - screenOffsetTop);
  const metricX = absoluteToMetric(absoluteX);
  const metricY = absoluteToMetric(absoluteY);
  const cursorOffset = vertical ? metricY : metricX;

  return (
    <Tick number={cursorOffset} offset={vertical ? y : x} vertical={vertical} />
  );
};
