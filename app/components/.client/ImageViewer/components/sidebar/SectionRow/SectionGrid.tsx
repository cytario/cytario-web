import { ReactNode } from "react";

interface SectionGridProps {
  children: ReactNode;
}

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
