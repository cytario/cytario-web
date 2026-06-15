import { twMerge } from "tailwind-merge";

interface TickProps {
  number?: number;
  offset: number;
}

export const Tick = ({ number, offset }: TickProps) => {
  const isMajor = typeof number === "number";
  const n = Math.round((number as number) * 100) / 100;
  const adjustedOffset = offset - 2; // Account for border width

  const cx = twMerge(
    "absolute left-0 bg-background",
    "border-l border-l-muted-foreground",
    isMajor ? "h-4" : "h-2",
  );

  return (
    <div
      className={cx}
      style={{
        transform: `translateX(${adjustedOffset}px)`,
      }}
    >
      {isMajor && <span className="px-1">{n}</span>}
    </div>
  );
};
