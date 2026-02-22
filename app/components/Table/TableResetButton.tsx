import { IconButton } from "@cytario/design";
import { RotateCcw } from "lucide-react";

import { useTableStore } from "./state/useTableStore";

export const TableResetButton = ({ tableId }: { tableId: string }) => {
  const store = useTableStore(tableId);

  return (
    <IconButton
      icon={RotateCcw}
      onPress={() => {
        // Call reset directly on store without subscribing to state
        store.getState().reset();
      }}
      variant="secondary"
      aria-label="Reset column widths and sorting to defaults"
    />
  );
};
