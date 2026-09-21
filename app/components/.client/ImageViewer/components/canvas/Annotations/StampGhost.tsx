import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import { useMeasurements } from "../Measurements/useMeasurements";

/** Ghost outline of the draw-box stamp extent, centered on the cursor. Pure
 *  display: no picking surface, sized from the level-0 px stamp size at the
 *  current zoom. */
export const StampGhost = () => {
  const mode = useViewerStore((s) => s.annotationMode);
  const stampWidthPx = useViewerStore((s) => s.annotationStampSize.widthPx);
  const stampHeightPx = useViewerStore((s) => s.annotationStampSize.heightPx);
  const cursorPosition = useViewerStore(select.cursorPosition);
  const { zoom } = useMeasurements();

  if (mode !== "draw-box" || !cursorPosition) return null;

  return (
    <div
      aria-hidden
      className={`
        pointer-events-none absolute
        border border-dashed border-(--color-slate-300)
        shadow-sm
      `}
      style={{
        left: cursorPosition.x,
        top: cursorPosition.y,
        width: stampWidthPx * 2 ** zoom,
        height: stampHeightPx * 2 ** zoom,
        transform: "translate(-50%, -50%)",
      }}
    />
  );
};
