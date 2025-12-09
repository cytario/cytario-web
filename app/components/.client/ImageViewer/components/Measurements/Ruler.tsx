import { CursorTick } from "./CursorTick";
import { Tick } from "./Tick";

export const Ruler = ({
  size,
  min,
  max,
  offset,
  one_mm,
  vertical,
}: {
  size: number;
  min: number;
  max: number;
  offset: number;
  one_mm: number;
  vertical?: boolean;
}) => {
  const arr: number[] = [];

  for (let i = min; i < max; i += 1) {
    arr.push(i);
  }

  return (
    <div
      className={`
        absolute top-0 left-0 
        w-4 h-4
        origin-top-left
        text-xs
        font-semibold
        ${vertical ? "rotate-90 translate-x-4" : ""}
      `}
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
        const label = isMajor ? i : undefined;

        return (
          <Tick
            key={i}
            number={label}
            offset={offset + i * one_mm}
            vertical={vertical}
          />
        );
      })}

      <CursorTick vertical={vertical} />
    </div>
  );
};
