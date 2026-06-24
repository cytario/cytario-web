import { Button, Icon } from "@cytario/design";

import { useLayoutStore } from "./useLayoutStore";

export function ShowFiltersToggle() {
  const showFilters = useLayoutStore((s) => s.showFilters);
  const toggleShowFilters = useLayoutStore((s) => s.toggleShowFilters);

  return (
    <Button size="sm" variant="outline" onPress={toggleShowFilters}>
      <Icon icon="ListFilter" size="sm" />
      {showFilters ? "Hide filters" : "Show filters"}
    </Button>
  );
}
