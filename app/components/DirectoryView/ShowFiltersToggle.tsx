import { Button } from "@cytario/design";
import { ListFilter } from "lucide-react";

import { useLayoutStore } from "./useLayoutStore";

export function ShowFiltersToggle() {
  const showFilters = useLayoutStore((s) => s.showFilters);
  const toggleShowFilters = useLayoutStore((s) => s.toggleShowFilters);

  return (
    <Button size="sm" variant="outline" onPress={toggleShowFilters}>
      <ListFilter size={16} />
      {showFilters ? "Hide filters" : "Show filters"}
    </Button>
  );
}
