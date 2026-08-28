import { Badge } from "@cytario/design";
import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { LoaderDots } from "~/components/Loader/LoaderDots";

interface PanelRowProps {
  swatch?: ReactNode;
  title: ReactNode;
  titleTruncate?: boolean;
  actions?: ReactNode;
  count?: number;
  toggle?: ReactNode;
  accessory?: ReactNode;
  selected?: boolean;
  className?: string;

  isLoading?: boolean;
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
  count,
  toggle,
  accessory,
  selected,
  className,
  isLoading = false,
}: PanelRowProps) {
  const cx = twMerge(
    `
      group/panelrow
      relative flex items-center
      gap-1 rounded-full
      px-2 py-1
      font-medium text-sm
      hover:bg-muted
    `,
    selected && "bg-muted",
    className,
  );

  return (
    <div className={cx}>
      {accessory}
      {/* w-6 gutter mirrors NodeLink's NodeIndicator so stacked file rows and
          panel rows share the same title left edge. */}
      {swatch && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center">{swatch}</span>
      )}

      <span className={twMerge("min-w-0 flex-1", titleTruncate && "truncate")}>{title}</span>

      {isLoading && <LoaderDots rows={1} cols={6} />}

      {actions}

      {count != null && <Badge>{count}</Badge>}

      {toggle}
    </div>
  );
}
