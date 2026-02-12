import { IconButton } from "../Controls";
import { useTableStore } from "./state/useTableStore";

export const TableResetButton = ({ tableId }: { tableId: string }) => {
  const store = useTableStore(tableId);

  return (
    <IconButton
      icon="RotateCcw"
      onClick={() => {
        // Call reset directly on store without subscribing to state
        store.getState().reset();
      }}
      theme="white"
      label="Reset column widths and sorting to defaults"
    />
  );
};
