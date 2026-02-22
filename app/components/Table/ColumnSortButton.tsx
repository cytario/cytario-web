import { IconButton } from "@cytario/design";
import { Header } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { TableRowData } from "./Table";

const getSortIcon = (sorted: false | "asc" | "desc") => {
  if (sorted === "asc") return ArrowUp;
  if (sorted === "desc") return ArrowDown;
  return ArrowUpDown;
};

export const ColumnSortButton = ({
  header,
}: {
  header: Header<TableRowData, unknown>;
}) => {
  const sortHandler = header.column.getToggleSortingHandler();

  return (
    <IconButton
      icon={getSortIcon(header.column.getIsSorted())}
      onPress={() => sortHandler?.({})}
      variant="ghost"
      aria-label={`Sort by ${header.column.columnDef.header}`}
      className="border-none"
    />
  );
};
