import {
  HeaderGroup,
  VisibilityState,
  flexRender,
} from "@tanstack/react-table";
import { twMerge } from "tailwind-merge";

import { ColumnFilterInput } from "./ColumnFilterInput";
import { ColumnResizeHandle } from "./ColumnResizeHandle";
import { ColumnSortButton } from "./ColumnSortButton";
import { TableMenu } from "./TableMenu";
import { ColumnConfig } from "./types";
import { TooltipSpan } from "../Tooltip/TooltipSpan";

interface TableHeaderRowProps {
  headerGroup: HeaderGroup<unknown>;
  columns: ColumnConfig[];
  tableId: string;
  toggleableColumns: ColumnConfig[];
  columnVisibility: VisibilityState;
  toggleColumn: (columnId: string) => void;
}

export function TableHeaderRow({
  headerGroup,
  columns,
  tableId,
  toggleableColumns,
  columnVisibility,
  toggleColumn,
}: TableHeaderRowProps) {
  return (
    <tr key={headerGroup.id} className="w-full block">
      {headerGroup.headers.map((header) => {
        const columnConfig = columns.find((col) => col.id === header.id);
        const isIndexColumn = header.id === "index";

        const isSorted = header.column.getIsSorted();

        const cx = twMerge(
          "relative pl-4 pr-4 group/header text-sm align-top",
          `text-${columnConfig?.align ?? "left"}`,
          isIndexColumn && "text-right tabular-nums",
        );

        const style = {
          width: header.getSize(),
          minWidth: header.getSize(),
          maxWidth: header.getSize(),
        };

        const tableHeadCx = " flex items-center gap-1 h-8 text-slate-500";

        return (
          <th key={header.id} className={cx} style={style}>
            {isIndexColumn ? (
              <TableMenu
                toggleableColumns={toggleableColumns}
                columnVisibility={columnVisibility}
                toggleColumn={toggleColumn}
                tableId={tableId}
              />
            ) : header.isPlaceholder ? null : (
              <div className="flex flex-col gap-1 pb-1">
                {header.column.getCanSort() ? (
                  <button
                    type="button"
                    className={twMerge(
                      tableHeadCx,
                      `cursor-pointer text-left
                      hover:text-slate-700
                    `,
                      isSorted && "text-slate-900",
                    )}
                    onClick={
                      header.column.getToggleSortingHandler() ?? undefined
                    }
                  >
                    <div className="flex-grow min-w-0">
                      <TooltipSpan>
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </TooltipSpan>
                    </div>
                    <ColumnSortButton header={header} />
                  </button>
                ) : (
                  <div className={tableHeadCx}>
                    <div className="flex-grow min-w-0">
                      <TooltipSpan>
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </TooltipSpan>
                    </div>
                  </div>
                )}

                {/* Column Filter */}
                {header.column.getCanFilter() &&
                  columnConfig?.enableColumnFilter && (
                    <ColumnFilterInput
                      column={header.column}
                      filterType={columnConfig.filterType ?? "text"}
                    />
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
