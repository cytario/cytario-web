import { Tick } from "./Tick";
import { useMeasurements } from "./useMeasurements";
import { absoluteToMetricFactory } from "./utils";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import { useDisplayUnitStore } from "~/utils/displayUnitStore/useDisplayUnitStore";

export const CursorTick = ({ vertical }: { vertical?: boolean }) => {
  const { zoom, screenOffsetLeft, screenOffsetTop } = useMeasurements();
  const metadata = useViewerStore(select.metadata);
  const cursorPosition = useViewerStore(select.cursorPosition);
  const displayUnit = useDisplayUnitStore((s) => s.displayUnit);

  if (!cursorPosition) return null;
  if (!metadata) return null;

  const x = cursorPosition.x - 0;
  const y = cursorPosition.y - 0;

  const screenPixelsToAbsolutePixels = (n: number) => n * (1 / 2 ** zoom);

  const absoluteX = screenPixelsToAbsolutePixels(x - screenOffsetLeft);
  const absoluteY = screenPixelsToAbsolutePixels(y - screenOffsetTop);

  if (displayUnit === "pixels") {
    return <Tick number={vertical ? absoluteY : absoluteX} offset={vertical ? y : x} />;
  }

  const unit = metadata.Pixels.PhysicalSizeXUnit;
  const absoluteToMetric = absoluteToMetricFactory(metadata.Pixels.PhysicalSizeX ?? 1, unit);

  const cursorOffset = vertical ? absoluteToMetric(absoluteY) : absoluteToMetric(absoluteX);

  return <Tick number={cursorOffset} offset={vertical ? y : x} />;
};
