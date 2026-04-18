import { ToggleButton } from "@cytario/design";
import { ListFilter } from "lucide-react";

import { useLayoutStore } from "./useLayoutStore";

export function ShowFiltersToggle() {
  const showFilters = useLayoutStore((s) => s.showFilters);
  const toggleShowFilters = useLayoutStore((s) => s.toggleShowFilters);

  return (
    <ToggleButton
      size="sm"
      isSquare
      isSelected={showFilters}
      onChange={toggleShowFilters}
      aria-label={showFilters ? "Hide filters" : "Show filters"}
    >
      <ListFilter size={16} />
    </ToggleButton>
  );
}
