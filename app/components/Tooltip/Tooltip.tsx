import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  ReactNode,
} from "react";
import ReactDOM from "react-dom";

// Use useLayoutEffect on client, useEffect on server to avoid SSR warning
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

interface Coords {
  x: number;
  y: number;
}

const offsetThreshold = 5;
const tooltipDelay = 500; // milliseconds
const tooltipOffset = 12;

export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [visible, setVisible] = useState(false);
  const [coordsInitial, setCoordsInitial] = useState<Coords>({ x: 0, y: 0 });
  const [coords, setCoords] = useState<Coords>({ x: 0, y: 0 });
  const [adjustedCoords, setAdjustedCoords] = useState<Coords>({ x: 0, y: 0 });
  const timerRef = useRef<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const calculateAdjustedPosition = (mouseX: number, mouseY: number) => {
    if (!tooltipRef.current) {
      return {
        x: mouseX + tooltipOffset,
        y: mouseY + tooltipOffset,
      };
    }

    const { width, height } = tooltipRef.current.getBoundingClientRect();

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = mouseX + tooltipOffset;
    let y = mouseY + tooltipOffset;

    // Adjust for right edge
    if (mouseX + width > viewportWidth) {
      x = mouseX - width - tooltipOffset;
    }

    // Adjust for bottom edge
    if (mouseY + height > viewportHeight) {
      y = mouseY - height - tooltipOffset;
    }

    return { x, y };
  };

  // Recalculate position after tooltip is rendered/resized
  // Using useIsomorphicLayoutEffect to synchronize with DOM measurements before paint
  // This avoids SSR warnings by using useEffect on server, useLayoutEffect on client
  useIsomorphicLayoutEffect(() => {
    if (visible && tooltipRef.current) {
      const adjusted = calculateAdjustedPosition(coords.x, coords.y);
      setAdjustedCoords(adjusted);
    }
  }, [visible, coords, content]);

  const handleMouseMove = ({ clientX, clientY }: React.MouseEvent) => {
    if (!visible) {
      setCoordsInitial({ x: clientX, y: clientY });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setVisible(true);
      }, tooltipDelay);
    }

    setCoords({ x: clientX, y: clientY });

    if (
      Math.abs(coords.x - coordsInitial.x) > offsetThreshold ||
      Math.abs(coords.y - coordsInitial.y) > offsetThreshold
    ) {
      hideTooltip();
    }
  };

  const hideTooltip = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const tooltipContent = visible ? (
    <div
      ref={tooltipRef}
      role="tooltip"
      className={`
          absolute z-50 px-2 py-1 rounded shadow-lg
          bg-black/80
          border border-white/20
          text-white text-sm
          pointer-events-none

          blurred backdrop-filter backdrop-blur-sm
        `}
      style={{
        left: adjustedCoords.x,
        top: adjustedCoords.y,
      }}
    >
      {content}
    </div>
  ) : null;

  return (
    <span
      style={{ position: "relative", display: "contents" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={hideTooltip}
    >
      {children}
      {typeof window !== "undefined" &&
        ReactDOM.createPortal(
          tooltipContent,
          document.getElementById("tooltip")!
        )}
    </span>
  );
};
