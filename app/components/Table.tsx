import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  ColumnDef,
} from "@tanstack/react-table";
import { ReactNode, useMemo } from "react";
import { twMerge } from "tailwind-merge";

import { IconButton } from "./Controls/IconButton";
import { TableProps as TablePropsType } from "./Table/types";
import { useColumnWidths } from "./Table/useColumnWidths";
import { useTableSorting } from "./Table/useTableSorting";
import { TooltipSpan } from "./Tooltip/TooltipSpan";

// Re-export types for external use
export type { ColumnConfig, TableProps } from "./Table/types";

type TableRowData = {
  index: number;
} & Record<string, string | ReactNode>;

export function Table({ columns, data, tableId = "default" }: TablePropsType) {
  // Get column widths from store with persistence
  const { columnSizing, setColumnSizing, resetWidths } = useColumnWidths(
    columns,
    tableId,
  );

  // Get sorting state from store with persistence
  const { sorting, setSorting, resetSorting } = useTableSorting(tableId);

  // Transform data into row objects with an index
  const tableData: TableRowData[] = useMemo(
    () =>
      data.map((row, index) => ({
        index: index + 1,
        ...row.reduce(
          (acc, cell, i) => {
            acc[`col_${i}`] = cell;
            return acc;
          },
          {} as Record<string, string | ReactNode>,
        ),
      })),
    [data],
  );

  // Create column definitions with proper IDs matching ColumnConfig
  const columnDefs: ColumnDef<TableRowData>[] = useMemo(() => {
    const indexColumn: ColumnDef<TableRowData> = {
      id: "index",
      header: "",
      accessorKey: "index",
      cell: (info) => info.getValue() as ReactNode,
      enableResizing: false,
      size: 48,
      minSize: 48,
      maxSize: 48,
    };

    const dataColumns = columns.map(
      (columnConfig, i): ColumnDef<TableRowData> => ({
        id: columnConfig.id,
        header: columnConfig.header,
        accessorKey: `col_${i}`,
        cell: (info) => info.getValue() as ReactNode,
        enableResizing: columnConfig.enableResizing !== false,
        enableSorting: columnConfig.sortable ?? false,
        sortingFn:
          typeof columnConfig.sortType === "function"
            ? (rowA, rowB) => {
                const accessor = columnConfig.sortType as (
                  rowIndex: number,
                ) => string | number | Date | null;
                const valueA = accessor(rowA.original.index - 1);
                const valueB = accessor(rowB.original.index - 1);

                // Handle null/undefined
                if (valueA == null && valueB == null) return 0;
                if (valueA == null) return 1;
                if (valueB == null) return -1;

                // Compare based on type
                if (typeof valueA === "number" && typeof valueB === "number") {
                  return valueA - valueB;
                }

                if (valueA instanceof Date && valueB instanceof Date) {
                  return valueA.getTime() - valueB.getTime();
                }

                // Default to string comparison
                return String(valueA).localeCompare(String(valueB));
              }
            : (columnConfig.sortType ?? "alphanumeric"),
        size: columnSizing[columnConfig.id] ?? columnConfig.defaultWidth ?? 150,
        minSize: columnConfig.minWidth ?? 48,
        maxSize: columnConfig.maxWidth ?? Number.MAX_SAFE_INTEGER,
      }),
    );

    return [indexColumn, ...dataColumns];
  }, [columns, columnSizing]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: tableData,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: {
      columnSizing,
      sorting,
    },
    onColumnSizingChange: setColumnSizing,
    onSortingChange: setSorting,
  });

  const cxTR = "w-full block";

  return (
    <table className="w-full">
      <thead className="sticky top-0 bg-white z-10 w-full shadow-md">
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id} className={cxTR}>
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
                    <IconButton
                      icon="RotateCcw"
                      onClick={() => {
                        resetWidths();
                        resetSorting();
                      }}
                      theme="white"
                      label="Reset column widths and sorting to defaults"
                    />
                  ) : header.isPlaceholder ? null : (
                    <div className="flex items-center gap-1">
                      <div className="flex-grow min-w-0">
                        <TooltipSpan>
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </TooltipSpan>
                      </div>

                      {header.column.getCanSort() && (
                        <IconButton
                          icon={
                            header.column.getIsSorted() === "asc"
                              ? "ArrowUp"
                              : header.column.getIsSorted() === "desc"
                              ? "ArrowDown"
                              : "ArrowUpDown"
                          }
                          onClick={
                            header.column.getToggleSortingHandler() ??
                            (() => {})
                          }
                          theme="transparent"
                          label={`Sort by ${header.column.columnDef.header}`}
                          className="border-none"
                        />
                      )}
                    </div>
                  )}

                  {/* Resize handle */}
                  {!isIndexColumn && header.column.getCanResize() && (
                    <button
                      type="button"
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className={`
                        absolute top-0 right-0 h-full w-[1px]
                        cursor-col-resize
                        transition-colors duration-100
                        z-20
                        bg-slate-300
                        margin-r-8
                      `}
                      aria-label={`Resize ${header.column.columnDef.header} column`}
                    ></button>
                  )}
                </th>
              );
            })}
          </tr>
        ))}
      </thead>

      <tbody>
        {table.getRowModel().rows.map((row, index) => {
          return (
            <tr
              key={row.id}
              className={twMerge(
                cxTR,
                index % 2 === 0 ? "bg-none" : "bg-gray-50",
                "hover:bg-gray-100 transition-colors",
              )}
            >
              {row.getVisibleCells().map((cell) => {
                const isIndexColumn = cell.column.id === "index";
                const columnConfig = columns.find(
                  (col) => col.id === cell.column.id,
                );

                const cxCell = twMerge(
                  isIndexColumn ? "text-right" : `text-${columnConfig?.align}`,
                  "px-2",
                  (columnConfig?.monospace || isIndexColumn) &&
                    "font-mono font-light",
                );

                const style = {
                  width: cell.column.getSize(),
                  minWidth: cell.column.getSize(),
                  maxWidth: cell.column.getSize(),
                };

                // For index column, use visual row number instead of stored index
                const content = isIndexColumn
                  ? index + 1
                  : flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext(),
                    );

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
        })}
      </tbody>
    </table>
  );
}
