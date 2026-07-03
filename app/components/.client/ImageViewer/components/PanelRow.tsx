import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

interface PanelRowProps {
  /** Leading visual: a ColorPicker, a static swatch, the brightfield tri-dot… */
  swatch?: ReactNode;
  title: ReactNode;
  /** Wrap the title in a truncating span (disable while the title is an input). */
  titleTruncate?: boolean;
  /** Hover/focus-revealed row actions (e.g. rename, delete). */
  actions?: ReactNode;
  /** Trailing metric: a pixel value, a member count… */
  value?: ReactNode;
  /** Trailing control, typically a visibility Switch. */
  toggle?: ReactNode;
  /** Absolutely-positioned overlays (intensity bar, loader); the row is `relative`. */
  accessory?: ReactNode;
  /** Row-level selection visual (accent bar + tint). Selection *semantics* stay
   *  with the caller — a RAC Radio root, a role="radio" title button, etc. */
  selected?: boolean;
  className?: string;
}

/**
 * The shared row shell of the viewer panels (channels, overlay markers,
 * annotation classes): swatch, title, optional actions/metric/toggle, in one
 * consistent layout with a common selected treatment. Purely presentational —
 * interactivity (radio semantics, click targets, popovers) belongs to the
 * slotted children and the caller's wrapper.
 */
export function PanelRow({
  swatch,
  title,
  titleTruncate = true,
  actions,
  value,
  toggle,
  accessory,
  selected,
  className,
}: PanelRowProps) {
  return (
    <div
      className={twMerge(
        "group/panelrow relative flex items-center gap-2 rounded border-l-2 border-transparent py-2 pl-1",
        selected && "border-primary bg-muted",
        className,
      )}
    >
      {accessory}
      {swatch}
      <span className={twMerge("min-w-0 flex-1 text-sm", titleTruncate && "truncate")}>
        {title}
      </span>
      {actions}
      {value != null && <span className="text-xs tabular-nums text-muted-foreground">{value}</span>}
      {toggle}
    </div>
  );
}
