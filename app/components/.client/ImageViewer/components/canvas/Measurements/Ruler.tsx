import { twMerge } from "tailwind-merge";

import { CursorTick } from "./CursorTick";
import { Tick } from "./Tick";

export const Ruler = ({
  size,
  min,
  max,
  offset,
  spacing,
  labelScale = 1,
  vertical,
}: {
  size: number;
  min: number;
  max: number;
  offset: number;
  /** Screen px between ticks. */
  spacing: number;
  /** Display-unit value added per tick (metric: 1; pixels: block size in level-0 px). */
  labelScale?: number;
  vertical?: boolean;
}) => {
  const arr: number[] = [];

  for (let i = min; i < max; i += 1) {
    arr.push(i);
  }

  const cx = twMerge(
    `
        absolute top-0 left-0 
        flex w-4 h-4
        origin-top-left
        text-xs
        font-semibold         
      `,
    vertical ? "rotate-90 translate-x-4" : "",
    vertical ? "items-end" : "items-start",
  );

  return (
    <div
      className={cx}
      style={{
        width: size,
      }}
    >
      {arr.map((i) => {
        let interval = 50;
        if (arr.length < 100) interval = 20;
        if (arr.length < 50) interval = 10;
        if (arr.length < 20) interval = 5;
        if (arr.length < 10) interval = 2;
        if (arr.length < 5) interval = 1;

        const isMajor = i % interval === 0;
        const label = isMajor ? i * labelScale : undefined;

        return <Tick key={i} number={label} offset={offset + i * spacing} />;
      })}

      <CursorTick vertical={vertical} />
    </div>
  );
};
