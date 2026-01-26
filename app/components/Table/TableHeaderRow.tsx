import { HeaderGroup, flexRender } from "@tanstack/react-table";
import { twMerge } from "tailwind-merge";

import { ColumnResizeHandle } from "./ColumnResizeHandle";
import { ColumnSortButton } from "./ColumnSortButton";
import { TableRowData } from "./Table";
import { TableResetButton } from "./TableResetButton";
import { ColumnConfig } from "./types";
import { TooltipSpan } from "../Tooltip/TooltipSpan";

interface TableHeaderRowProps {
  headerGroup: HeaderGroup<TableRowData>;
  columns: ColumnConfig[];
  tableId: string;
}

export function TableHeaderRow({
  headerGroup,
  columns,
  tableId,
}: TableHeaderRowProps) {
  return (
    <tr key={headerGroup.id} className="w-full block">
      {headerGroup.headers.map((header) => {
        const columnConfig = columns.find((col) => col.id === header.id);
        const isIndexColumn = header.id === "index";

        const cx = twMerge(
          "relative p-2",
          isIndexColumn ? "text-right" : `text-${columnConfig?.align}`,
          columnConfig?.monospace && "font-mono font-bold",
          isIndexColumn && "font-mono font-bold",
        );

        const style = {
          width: header.getSize(),
          minWidth: header.getSize(),
          maxWidth: header.getSize(),
        };

        return (
          <th key={header.id} className={cx} style={style}>
            {isIndexColumn ? (
              <TableResetButton tableId={tableId} columns={columns} />
            ) : header.isPlaceholder ? null : (
              <div className="flex items-center gap-1">
                {/* Column Name */}
                <div className="flex-grow min-w-0">
                  <TooltipSpan>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </TooltipSpan>
                </div>

                {/* Column Sort Button */}
                {header.column.getCanSort() && (
                  <ColumnSortButton header={header} />
                )}
              </div>
            )}

            {/* Resize handle */}
            {!isIndexColumn && header.column.getCanResize() && (
              <ColumnResizeHandle header={header} />
            )}
          </th>
        );
      })}
    </tr>
  );
}
