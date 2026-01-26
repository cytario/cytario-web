import { ColumnConfig } from "./types";
import { useColumnWidths } from "./useColumnWidths";
import { useTableSorting } from "./useTableSorting";
import { IconButton } from "../Controls/IconButton";

export const TableResetButton = ({
  tableId,
  columns,
}: {
  tableId: string;
  columns: ColumnConfig[];
}) => {
  const { resetWidths } = useColumnWidths(columns, tableId);
  const { resetSorting } = useTableSorting(tableId);

  return (
    <IconButton
      icon="RotateCcw"
      onClick={() => {
        resetWidths();
        resetSorting();
      }}
      theme="white"
      label="Reset column widths and sorting to defaults"
    />
  );
};
