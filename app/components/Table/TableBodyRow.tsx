import { Checkbox } from "@cytario/design";
import { Row, flexRender } from "@tanstack/react-table";
import { KeyboardEvent, useCallback } from "react";
import { twMerge } from "tailwind-merge";

import { ColumnConfig } from "./types";
import { TooltipSpan } from "../Tooltip/TooltipSpan";

interface TableBodyRowProps {
  row: Row<unknown>;
  rowIndex: number;
  columns: ColumnConfig[];
  enableRowSelection: boolean;
  className?: string;
}

export function TableBodyRow({
  row,
  rowIndex,
  columns,
  enableRowSelection,
  className,
}: TableBodyRowProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableRowElement>) => {
      const tr = event.currentTarget;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const next = tr.nextElementSibling as HTMLElement | null;
        next?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const prev = tr.previousElementSibling as HTMLElement | null;
        prev?.focus();
      } else if (event.key === "Enter") {
        const link = tr.querySelector("a");
        link?.click();
      }
    },
    [],
  );

  return (
    <tr
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={twMerge(
        "w-full block border-b border-slate-300",
        "hover:bg-slate-50 transition-colors",
        "focus-visible:outline-none focus-visible:bg-slate-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cytario-turquoise-700",
        row.getIsSelected() && "bg-cytario-turquoise-50",
        className,
      )}
    >
      {row.getVisibleCells().map((cell) => {
        const isIndexColumn = cell.column.id === "index";
        const columnConfig = columns.find((col) => col.id === cell.column.id);

        const isRight = columnConfig?.align === "right";
        const alignClass = isRight
          ? "text-right"
          : columnConfig?.align === "center"
            ? "text-center"
            : "text-left";
        const cxCell = twMerge(
          "px-4 py-2",
          isIndexColumn ? "text-right" : alignClass,
          columnConfig?.monospace && "font-mono font-light",
          (isRight || isIndexColumn) && "tabular-nums",
          !columnConfig?.anchor && !isIndexColumn && "text-sm",
        );

        const style = {
          width: cell.column.getSize(),
          minWidth: cell.column.getSize(),
          maxWidth: cell.column.getSize(),
        };

        const rawValue = cell.getValue();
        const useRawString =
          columnConfig?.ellipsis === "middle" && typeof rawValue === "string";

        const content = isIndexColumn
          ? rowIndex + 1
          : useRawString
            ? rawValue
            : flexRender(cell.column.columnDef.cell, cell.getContext());

        const copyValue =
          columnConfig?.copyable && typeof rawValue === "string"
            ? rawValue
            : undefined;

        return isIndexColumn ? (
          <th key={cell.id} className="p-2" style={style}>
            <div className="flex items-center gap-1 text-sm text-slate-500 tabular-nums justify-between">
              {enableRowSelection && (
                <Checkbox
                  isSelected={row.getIsSelected()}
                  onChange={() => row.toggleSelected()}
                />
              )}
              <span>{rowIndex + 1}</span>
            </div>
          </th>
        ) : (
          <td key={cell.id} className={cxCell} style={style}>
            <TooltipSpan
              ellipsis={columnConfig?.ellipsis}
              copyValue={copyValue}
            >
              {content}
            </TooltipSpan>
          </td>
        );
      })}
    </tr>
  );
}
