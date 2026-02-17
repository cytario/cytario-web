import { useState, useEffect, useCallback } from "react";
import { twMerge } from "tailwind-merge";

export const LavaLoader = ({
  absolute = false,
  rows = 3,
  cols = 3,
}: {
  absolute?: boolean;
  rows?: number;
  cols?: number;
}) => {
  const totalDots = rows * cols;
  const size = 12;
  const duration = 500;

  const pickRandomDot = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * totalDots);
    const col = randomIndex % cols;
    const row = Math.floor(randomIndex / cols);
    return { row, col };
  }, [totalDots, cols]);

  const pickNeighbor = useCallback(
    (current: { row: number; col: number }) => {
      const neighbors: { row: number; col: number }[] = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = current.row + dr;
          const nc = current.col + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            neighbors.push({ row: nr, col: nc });
          }
        }
      }
      return neighbors[Math.floor(Math.random() * neighbors.length)];
    },
    [rows, cols]
  );

  const [activeDot, setActiveDot] = useState<{
    row: number;
    col: number;
  }>(pickRandomDot());

  useEffect(() => {
    const interval = setInterval(
      () => setActiveDot((prev) => pickNeighbor(prev)),
      duration
    );
    return () => clearInterval(interval);
  }, [pickNeighbor, duration]);

  const cx = twMerge(
    "flex items-center justify-center w-full h-full",
    absolute ? "absolute" : "relative"
  );

  return (
    <div className={cx}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        version="1.1"
        width={(cols + 1) * size}
        height={(rows + 1) * size}
        shapeRendering="geometricPrecision"
      >
        <defs>
          <filter id="lava">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 12 -6"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>

        <g filter="url(#lava)">
          {Array.from({ length: totalDots }, (_, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const isActive = activeDot?.row === row && activeDot?.col === col;

            return (
              <circle
                key={`${i}-${row}`}
                cx={size + col * size}
                cy={size + row * size}
                r={isActive ? 12 : 4}
                className={`dot-${i}-${row} fill-slate-300 `}
              />
            );
          })}
        </g>
      </svg>

      <style>{`
        circle {
          transition: r ${duration / 1000}s linear;
        }
      `}</style>
    </div>
  );
};
