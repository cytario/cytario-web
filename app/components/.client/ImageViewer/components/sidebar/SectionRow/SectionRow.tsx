import { Badge } from "@cytario/design";
import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { ColorPicker } from "./ColorPicker/ColorPicker";
import { IntensityBar } from "./IntensityBar";
import { RGB, RGBA } from "../../../state/store/types";
import { LoaderDots } from "~/components/Loader/LoaderDots";

interface SectionRowProps {
  title: ReactNode;
  titleTruncate?: boolean;
  actions?: ReactNode;
  count?: number;
  /** Scale maximum for count; with colors, count, and this set, renders the
   *  bottom intensity bar. */
  countMax?: number;
  /** Row colors: a single color renders the picker (or a static swatch when
   *  onColorChange is absent); several colors render a static multi-segment
   *  swatch. */
  colors?: (RGB | RGBA)[];
  /** Receives the same color shape given in colors — the picker's RGB choice
   *  re-attached to the original alpha when there was one. Applies to a
   *  single color only. */
  onColorChange?(color: RGB | RGBA): void;
  /** Accessible name for the color control, e.g. "CD3 color". */
  colorLabel?: string;
  toggle?: ReactNode;
  selected?: boolean;
  className?: string;

  isLoading?: boolean;
}

/**
 * The shared row shell of the viewer sidebar controls (channels, overlay
 * markers, annotation classes): color swatch (a picker when onColorChange is
 * set), title, optional actions/metric/toggle, in one consistent layout with
 * a common selected treatment. Interaction semantics (radio, click targets)
 * belong to the caller's wrapper.
 */
export function SectionRow({
  colors,
  onColorChange,
  colorLabel,
  title,
  titleTruncate = true,
  actions,
  count,
  countMax,
  toggle,
  selected,
  className,
  isLoading = false,
}: SectionRowProps) {
  const cx = twMerge(
    `
      group/controlrow
      relative flex items-center
      gap-1 rounded-full
      px-2 py-1
      font-medium text-sm
      hover:bg-muted
    `,
    selected && "bg-muted",
    className,
  );

  const [first] = colors ?? [];

  return (
    <div className={cx}>
      <IntensityBar count={count} countMax={countMax} color={first} />
      {colors && colors.length > 0 && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center">
          <ColorPicker colors={colors} onColorChange={onColorChange} label={colorLabel} />
        </span>
      )}

      <span className={twMerge("min-w-0 flex-1", titleTruncate && "truncate")}>{title}</span>

      {isLoading && <LoaderDots rows={1} cols={6} />}

      {/* Custom Actions */}
      {actions}

      {count != null && <Badge>{count}</Badge>}

      {toggle}
    </div>
  );
}
