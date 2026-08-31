import { MetricText } from "@cytario/design";
import { twMerge } from "tailwind-merge";

import { formatTick, generateTicks } from "./axisScale";

interface AxisTicksProps {
  orientation: "x" | "y";
  max: number;
  log: boolean;
  toRatio: (value: number) => number;
}

export function AxisTicks({ orientation, max, log, toRatio }: AxisTicksProps) {
  const isX = orientation === "x";
  const ticks = generateTicks(max, log, isX);

  return (
    <div className={isX ? "relative h-4" : "absolute inset-y-0 right-0 w-1"}>
      {ticks.map((value, i) => {
        const pos = `${toRatio(value) * 100}%`;
        const cx = twMerge(
          "absolute bg-background/80 backdrop-blur",
          isX
            ? " border-l border-l-muted-foreground px-1"
            : "-translate-x-full border-t border-t-muted-foreground px-1",
        );
        return (
          <MetricText
            key={i}
            className={cx}
            style={isX ? { left: pos, top: 0 } : { top: `calc(100% - ${pos})`, left: 0 }}
          >
            {formatTick(value)}
          </MetricText>
        );
      })}
    </div>
  );
}
