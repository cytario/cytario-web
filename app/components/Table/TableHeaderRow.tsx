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
import { Checkbox, IconButton } from "../Controls";
import { TooltipSpan } from "../Tooltip/TooltipSpan";

interface TableHeaderRowProps {
  headerGroup: HeaderGroup<unknown>;
  columns: ColumnConfig[];
  tableId: string;
  toggleableColumns: ColumnConfig[];
  columnVisibility: VisibilityState;
  toggleColumn: (columnId: string) => void;
  enableRowSelection: boolean;
  hasFilters: boolean;
  onClearAllFilters: () => void;
  showFilters: boolean;
}

export function TableHeaderRow({
  headerGroup,
  columns,
  tableId,
  toggleableColumns,
  columnVisibility,
  toggleColumn,
  enableRowSelection,
  hasFilters,
  onClearAllFilters,
  showFilters,
}: TableHeaderRowProps) {
  return (
    <tr key={headerGroup.id} className="w-full block">
      {headerGroup.headers.map((header) => {
        const columnConfig = columns.find((col) => col.id === header.id);

        const isIndexColumn = header.id === "index";

        const isSorted = header.column.getIsSorted();

        // Dynamic classNames for table header
        const baseClass = "relative pl-4 pr-4 group/header text-sm align-top";
        const indexClass = "text-right tabular-nums text-center p-1 px-2";

        const alignClasses: Record<string, string> = {
          left: "text-left",
          right: "text-right",
          center: "text-center",
        };
        const alignClass = alignClasses[columnConfig?.align ?? "left"];

        const cxTh = twMerge(
          baseClass,
          isIndexColumn ? indexClass : alignClass,
        );

        const style = {
          width: header.getSize(),
          minWidth: header.getSize(),
          maxWidth: header.getSize(),
        };

        const isRight = columnConfig?.align === "right";
        const tableHeadCx = `
          flex items-center justify-between gap-1 h-8 text-left text-slate-500
        `;

        const tableHeadToggleCx = `
          cursor-pointer
          hover:text-slate-700
          focus-visible:outline-none
          focus-visible:ring-2
          focus-visible:ring-cytario-turquoise-700
          focus-visible:ring-offset-1
          rounded-sm
        `;

        return (
          <th
            key={header.id}
            className={cxTh}
            style={style}
            aria-sort={
              isSorted === "asc"
                ? "ascending"
                : isSorted === "desc"
                  ? "descending"
                  : undefined
            }
          >
            {isIndexColumn ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1">
                  {enableRowSelection && (
                    <Checkbox
                      checked={header.getContext().table.getIsAllRowsSelected()}
                      indeterminate={
                        header.getContext().table.getIsSomeRowsSelected() &&
                        !header.getContext().table.getIsAllRowsSelected()
                      }
                      onChange={() =>
                        header.getContext().table.toggleAllRowsSelected()
                      }
                    />
                  )}
                  <TableMenu
                    toggleableColumns={toggleableColumns}
                    columnVisibility={columnVisibility}
                    toggleColumn={toggleColumn}
                    tableId={tableId}
                  />
                </div>
                {hasFilters && (
                  <IconButton
                    icon="FilterX"
                    scale="small"
                    theme="white"
                    onClick={onClearAllFilters}
                    label="Clear all filters"
                  />
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2 pb-2">
                {header.column.getCanSort() ? (
                  /*  Sortable Header */
                  <button
                    type="button"
                    className={twMerge(
                      tableHeadCx,
                      tableHeadToggleCx,
                      isRight && "flex-row-reverse",
                      isSorted && "text-slate-900",
                    )}
                    onClick={
                      header.column.getToggleSortingHandler() ?? undefined
                    }
                  >
                    <div className="min-w-0">
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
                  // Non-Sortable Header
                  <div className={tableHeadCx}>
                    <div className="min-w-0">
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
                {showFilters &&
                  header.column.getCanFilter() &&
                  columnConfig?.enableColumnFilter && (
                    <ColumnFilterInput
                      column={header.column}
                      filterType={columnConfig.filterType ?? "text"}
                      filterPlaceholder={columnConfig.filterPlaceholder}
                      filterOptions={columnConfig.filterOptions}
                      filterRender={columnConfig.filterRender}
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
