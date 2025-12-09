import { twMerge } from "tailwind-merge";

interface TickProps {
  number?: number;
  offset: number;
  label?: string | number;
  vertical?: boolean;
}

export const Tick = ({ number, offset, vertical = false }: TickProps) => {
  const isMajor = typeof number === "number";

  const n = Math.round((number as number) * 100) / 100;

  const cx = twMerge(
    "absolute left-0 bg-slate-900",
    "border-l border-l-slate-300",
    isMajor ? "h-4" : "h-2",
    vertical ? "rotate-90" : "",
    vertical ? "bottom-0" : "top-0"
  );

  const adjustedOffset = Math.floor(offset) - (vertical ? 2 : 3);

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
