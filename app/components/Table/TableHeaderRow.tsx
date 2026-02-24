import {
  HeaderGroup,
  VisibilityState,
  flexRender,
} from "@tanstack/react-table";
import { twMerge } from "tailwind-merge";
import { useStore } from "zustand";

import { ColumnFilterInput } from "./ColumnFilterInput";
import { ColumnResizeHandle } from "./ColumnResizeHandle";
import { ColumnSortButton } from "./ColumnSortButton";
import { useTableStore } from "./state/useTableStore";
import { TableMenu } from "./TableMenu";
import { ColumnConfig } from "./types";
import { IconButton } from "../Controls";
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
  const store = useTableStore(tableId);
  const hasFilters = useStore(store, (s) => s.columnFilters.length > 0);
  const clearAllFilters = () => store.getState().setColumnFilters([]);

  return (
    <tr key={headerGroup.id} className="w-full block">
      {headerGroup.headers.map((header) => {
        const columnConfig = columns.find((col) => col.id === header.id);
        const isIndexColumn = header.id === "index";

        const isSorted = header.column.getIsSorted();

        const alignClass =
          columnConfig?.align === "right"
            ? "text-right"
            : columnConfig?.align === "center"
              ? "text-center"
              : "text-left";
        const cx = twMerge(
          "relative pl-4 pr-4 group/header text-sm align-top",
          isIndexColumn ? "text-right tabular-nums" : alignClass,
        );

        const style = {
          width: header.getSize(),
          minWidth: header.getSize(),
          maxWidth: header.getSize(),
        };

        const isRight = columnConfig?.align === "right";
        const tableHeadCx = "flex items-center gap-1 h-8 text-left text-slate-500";

        return (
          <th key={header.id} className={cx} style={style}>
            {isIndexColumn ? (
              <div className="flex flex-col gap-1">
                <TableMenu
                  toggleableColumns={toggleableColumns}
                  columnVisibility={columnVisibility}
                  toggleColumn={toggleColumn}
                  tableId={tableId}
                />
                {hasFilters && (
                  <IconButton
                    icon="FilterX"
                    scale="small"
                    theme="secondary"
                    onClick={clearAllFilters}
                    label="Clear all filters"
                  />
                )}
              </div>
            ) : header.isPlaceholder ? null : (
              <div className="flex flex-col gap-1 pb-1">
                {header.column.getCanSort() ? (
                  <button
                    type="button"
                    className={twMerge(
                      tableHeadCx,
                      "cursor-pointer hover:text-slate-700",
                      isRight && "flex-row-reverse",
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
                      filterOptions={columnConfig.filterOptions}
                      filterTree={columnConfig.filterTree}
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
