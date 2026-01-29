import { Header } from "@tanstack/react-table";

import { TableRowData } from "./Table";
import { IconButton } from "../Controls/IconButton";

export const ColumnSortButton = ({
  header,
}: {
  header: Header<TableRowData, unknown>;
}) => {
  return (
    <IconButton
      icon={
        header.column.getIsSorted() === "asc"
          ? "ArrowUp"
          : header.column.getIsSorted() === "desc"
            ? "ArrowDown"
            : "ArrowUpDown"
      }
      onClick={header.column.getToggleSortingHandler() ?? (() => {})}
      theme="transparent"
      label={`Sort by ${header.column.columnDef.header}`}
      className="border-none"
    />
  );
};
