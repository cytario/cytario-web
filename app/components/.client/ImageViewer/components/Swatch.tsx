import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

/**
 * Static, non-interactive color swatch in the interactive ColorSwatch's shape,
 * so every panel row leads with the same circle: solid fill (peer classes),
 * dashed unfilled (unclassified), or custom children (brightfield tri-dot).
 */
export function Swatch({
  color,
  className,
  children,
}: {
  /** CSS color for the fill; omit for an unfilled swatch. */
  color?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={twMerge(
        "flex h-5 w-5 shrink-0 overflow-hidden rounded-full border-2 border-border",
        className,
      )}
      style={color ? { backgroundColor: color } : undefined}
      aria-hidden
    >
      {children}
    </span>
  );
}
