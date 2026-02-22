import { useMeasurements } from "./useMeasurements";
import { select } from "../../state/selectors";
import { useViewerStore } from "../../state/ViewerStoreContext";

export const Svg = ({ children }: { children: React.ReactNode }) => {
  const { viewPortWidth, viewPortHeight } = useMeasurements();

  return (
    <svg
      width={viewPortWidth}
      height={viewPortHeight}
      className="pointer-events-none absolute top-0 left-0 "
    >
      {children}
    </svg>
  );
};

/**
 * Crosshair component for displaying a crosshair at the cursor position.
 */
export const Crosshair = () => {
  const cursorPosition = useViewerStore(select.cursorPosition);
  const metadata = useViewerStore(select.metadata);

  if (!cursorPosition || !metadata) return null;

  const width = 3;
  const size = 8;

  // Adjust to center
  const x = Math.floor(cursorPosition.x) - width / 2;
  const y = Math.floor(cursorPosition.y) - width / 2;

  return (
    <Svg>
      <g transform={`translate(${x}, ${y})`}>
        <g>
          <line
            x1={0}
            y1={-size}
            x2={0}
            y2={+size}
            strokeWidth={3}
            className="stroke-[var(--color-text-tertiary)]"
          />
          <line
            x1={-size}
            y1={0}
            x2={+size}
            y2={0}
            strokeWidth={3}
            className="stroke-[var(--color-text-tertiary)]"
          />
        </g>
        <g>
          <line
            x1={0}
            y1={1 - size}
            x2={0}
            y2={size - 1}
            strokeWidth={1}
            className="stroke-black "
          />
          <line
            x1={1 - size}
            y1={0}
            x2={size - 1}
            y2={0}
            strokeWidth={1}
            className="stroke-black "
          />
        </g>
      </g>
    </Svg>
  );
};
