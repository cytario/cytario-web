import { Row, flexRender } from "@tanstack/react-table";
import { twMerge } from "tailwind-merge";

import { ColumnConfig } from "./types";
import { TooltipSpan } from "../Tooltip/TooltipSpan";

interface TableBodyRowProps {
  row: Row<unknown>;
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

        const isRight = columnConfig?.align === "right";
        const alignClass =
          isRight
            ? "text-right"
            : columnConfig?.align === "center"
              ? "text-center"
              : "text-left";
        const cxCell = twMerge(
          "px-4 py-2",
          isIndexColumn ? "text-right" : alignClass,
          (columnConfig?.monospace || isRight || isIndexColumn) && "tabular-nums",
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
