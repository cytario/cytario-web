import { Tick } from "./Tick";
import { useDisplayScale } from "./useDisplayScale";
import { useMeasurements } from "./useMeasurements";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";

export const CursorTick = ({ vertical }: { vertical?: boolean }) => {
  const { zoom, screenOffsetLeft, screenOffsetTop } = useMeasurements();
  const metadata = useViewerStore(select.metadata);
  const cursorPosition = useViewerStore(select.cursorPosition);
  const scale = useDisplayScale();

  if (!cursorPosition) return null;
  if (!metadata) return null;

  const x = cursorPosition.x - 0;
  const y = cursorPosition.y - 0;

  const screenPixelsToAbsolutePixels = (n: number) => n * (1 / 2 ** zoom);

  const absoluteX = screenPixelsToAbsolutePixels(x - screenOffsetLeft);
  const absoluteY = screenPixelsToAbsolutePixels(y - screenOffsetTop);

  if (scale.unit === "pixels") {
    return <Tick number={Math.round(vertical ? absoluteY : absoluteX)} offset={vertical ? y : x} />;
  }

  // The rulers measure both axes in X spacing; the cursor tick matches them.
  const cursorOffset = (vertical ? absoluteY : absoluteX) * scale.pixelSize.x;

  return <Tick number={cursorOffset} offset={vertical ? y : x} />;
};
