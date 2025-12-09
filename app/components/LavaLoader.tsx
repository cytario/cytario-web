import { useState, useEffect, useMemo, useCallback } from "react";
import { twMerge } from "tailwind-merge";

export const LavaLoader = ({ absolute = false }: { absolute?: boolean }) => {
  const dots = useMemo(() => [1, 2, 3, 4, 5, 6, 7, 8, 9], []);
  const size = 12;
  const duration = 500;

  const pickRandomDot = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * dots.length);
    const col = randomIndex % 3;
    const row = Math.floor(randomIndex / 3);
    return { row, col };
  }, [dots]);

  const [activeDot, setActiveDot] = useState<{
    row: number;
    col: number;
  }>(pickRandomDot());

  useEffect(() => {
    const interval = setInterval(() => setActiveDot(pickRandomDot()), duration);
    return () => clearInterval(interval);
  }, [dots, pickRandomDot, duration]);

  const cx = twMerge(
    "flex items-center justify-center w-full h-full",
    absolute ? "absolute" : "relative"
  );

  return (
    <div className={cx}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        version="1.1"
        width={48}
        height={48}
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
          {dots.map((_, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
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
