import { Row, flexRender } from "@tanstack/react-table";
import { twMerge } from "tailwind-merge";

import { TableRowData } from "./Table";
import { ColumnConfig } from "./types";
import { TooltipSpan } from "../Tooltip/TooltipSpan";

interface TableBodyRowProps {
  row: Row<TableRowData>;
  rowIndex: number;
  columns: ColumnConfig[];
  className?: string;
}

export function TableBodyRow({
  row,
  rowIndex,
  columns,
  className,
}: TableBodyRowProps) {
  return (
    <tr
      className={twMerge(
        "w-full block",
        rowIndex % 2 === 0 ? "bg-none" : "bg-gray-50",
        "hover:bg-gray-100 transition-colors",
        className,
      )}
    >
      {row.getVisibleCells().map((cell) => {
        const isIndexColumn = cell.column.id === "index";
        const columnConfig = columns.find((col) => col.id === cell.column.id);

        const cxCell = twMerge(
          isIndexColumn ? "text-right" : `text-${columnConfig?.align}`,
          "px-2",
          (columnConfig?.monospace || isIndexColumn) && "font-mono font-light",
        );

        const style = {
          width: cell.column.getSize(),
          minWidth: cell.column.getSize(),
          maxWidth: cell.column.getSize(),
        };

        // For index column, use visual row number instead of stored index
        const content = isIndexColumn
          ? rowIndex + 1
          : flexRender(cell.column.columnDef.cell, cell.getContext());

        return isIndexColumn ? (
          <th key={cell.id} className={cxCell} style={style}>
            <TooltipSpan>{content}</TooltipSpan>
          </th>
        ) : (
          <td key={cell.id} className={cxCell} style={style}>
            <TooltipSpan>{content}</TooltipSpan>
          </td>
        );
      })}
    </tr>
  );
}
