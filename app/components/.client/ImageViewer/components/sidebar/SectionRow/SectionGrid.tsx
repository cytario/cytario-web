import { ReactNode } from "react";

interface SectionGridProps {
  children: ReactNode;
}

/** Width at which this grid shows its 3rd column — the @lg container token
 *  (--container-lg, 32rem). Floating panels carrying one of these grids spawn
 *  one container step above it (--container-xl, 36rem): the panel's own chrome
 *  (1px borders, classic scrollbars take inline space) shrinks the measured
 *  @container below a bare token-width spawn. */
export const SECTION_GRID_3COL_WIDTH = 36 * 16;

/** Responsive grid for sidebar control rows: column count tracks the enclosing
 *  container width (container query, not viewport) so it reflows with the
 *  user-resizable sidebar — 1 → 2 → 3 columns at @sm / @lg. */
export function SectionGrid({ children }: SectionGridProps) {
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-1 px-2 py-3 @sm:grid-cols-2 @lg:grid-cols-3">
        {children}
      </div>
    </div>
  );
}
