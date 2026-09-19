import { Badge } from "@cytario/design";
import { forwardRef, ReactNode, useImperativeHandle, useRef } from "react";
import { twMerge } from "tailwind-merge";

import { ColorPicker } from "./ColorPicker/ColorPicker";
import { IntensityBar } from "./IntensityBar";
import { SectionRowTitle, SectionRowTitleHandle } from "./SectionRowTitle";
import { RGB, RGBA } from "../../../state/store/types";
import { LoaderDots } from "~/components/Loader/LoaderDots";

export type SectionRowHandle = SectionRowTitleHandle;

interface SectionRowProps {
  title: string;
  /** Rename commit; only fired when the new name is non-empty and different. */
  onRename?: (next: string) => void;
  actions?: ReactNode;
  count?: number;
  /** Scale maximum for the intensity bar. */
  countMax?: number;
  /** Single → picker/static swatch; multiple → static multi-segment swatch. */
  colors: (RGB | RGBA)[];
  /** Picker's RGB choice, re-attached to the original alpha. */
  onColorChange?(color: RGB | RGBA): void;
  toggle?: ReactNode;
  isSelected?: boolean;
  className?: string;
  isLoading?: boolean;
}

/** Shared row shell of the viewer sidebar controls: swatch, title, actions, metric, toggle. */
export const SectionRow = forwardRef<SectionRowHandle, SectionRowProps>(function SectionRow(
  {
    colors,
    onColorChange,
    title,
    onRename,
    actions,
    count,
    countMax,
    toggle,
    isSelected,
    className,
    isLoading = false,
  },
  ref,
) {
  const titleRef = useRef<SectionRowTitleHandle>(null);
  useImperativeHandle(ref, () => ({ startRename: () => titleRef.current?.startRename() }));

  const cx = twMerge(
    `
      group/controlrow
      relative flex items-center
      gap-1 rounded-full
      p-1 h-7
      font-medium text-sm
      hover:bg-muted
      transition-colors
    `,
    isSelected && "bg-muted",
    className,
  );

  return (
    <div className={cx}>
      {/* Absolutely positioned intensity bar */}
      <IntensityBar count={count} countMax={countMax} color={colors[0]} />

      {colors.length > 0 && (
        <ColorPicker colors={colors} onColorChange={onColorChange} label={`${title} color`} />
      )}

      <SectionRowTitle ref={titleRef} title={title} onRename={onRename} />

      {isLoading && <LoaderDots rows={1} cols={6} />}

      {actions}

      {count != null && <Badge>{count}</Badge>}

      {toggle}
    </div>
  );
});
