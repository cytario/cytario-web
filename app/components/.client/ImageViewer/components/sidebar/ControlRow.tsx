import { Badge } from "@cytario/design";
import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { ColorPicker } from "./ChannelsSection/ColorPicker/ColorPicker";
import { ColorSwatch } from "./ChannelsSection/ColorPicker/ColorSwatch";
import { IntensityBar } from "./IntensityBar";
import { RGB, RGBA } from "../../state/store/types";
import { LoaderDots } from "~/components/Loader/LoaderDots";

interface ControlRowProps {
  title: ReactNode;
  titleTruncate?: boolean;
  actions?: ReactNode;
  count?: number;
  /** Scale maximum for count; with colors, count, and this set, renders the
   *  bottom intensity bar. */
  countMax?: number;
  /** Row colors: a single color renders the swatch (a picker when
   *  onColorChange is set, a static swatch otherwise); several colors render
   *  a static multi-segment swatch. */
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
export function ControlRow({
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
}: ControlRowProps) {
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
  const [r, g, b, alpha] = first ?? [0, 0, 0];
  const echo =
    onColorChange &&
    ((rgbChoice: RGB) => onColorChange(alpha != null ? [...rgbChoice, alpha] : rgbChoice));

  return (
    <div className={cx}>
      <IntensityBar count={count} countMax={countMax} color={first} />
      {colors != null && colors.length > 1 ? (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center">
          <ColorSwatch colors={colors} isDisabled />
        </span>
      ) : first != null ? (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center">
          <ColorPicker color={[r, g, b]} onColorChange={echo} label={colorLabel} />
        </span>
      ) : null}

      <span className={twMerge("min-w-0 flex-1", titleTruncate && "truncate")}>{title}</span>

      {isLoading && <LoaderDots rows={1} cols={6} />}

      {actions}

      {count != null && <Badge>{count}</Badge>}

      {toggle}
    </div>
  );
}
