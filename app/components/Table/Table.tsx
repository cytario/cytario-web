import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import { ReactNode, useMemo } from "react";

import { TableBodyRow } from "./TableBodyRow";
import { TableHeaderRow } from "./TableHeaderRow";
import { SortingAccessor, TableProps as TablePropsType } from "./types";
import { useColumnWidths } from "./useColumnWidths";
import { useTableSorting } from "./useTableSorting";

// Re-export types for external use
export type { ColumnConfig, TableProps } from "./types";

export type TableRowData = {
  index: number;
} & Record<string, string | ReactNode>;

export function Table({ columns, data, tableId = "default" }: TablePropsType) {
  const { columnSizing, setColumnSizing } = useColumnWidths(columns, tableId);
  const { sorting, setSorting } = useTableSorting(tableId);

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
        enableSorting: columnConfig.enableSorting ?? false,
        sortingFn:
          typeof columnConfig.sortingFn === "function"
            ? (rowA, rowB) => {
                const accessor = columnConfig.sortingFn as SortingAccessor;
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
            : (columnConfig.sortingFn ?? "alphanumeric"),
        size: columnSizing[columnConfig.id] ?? columnConfig.size ?? 150,
        minSize: columnConfig.minSize ?? 48,
        maxSize: columnConfig.maxSize ?? Number.MAX_SAFE_INTEGER,
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

  return (
    <table className="w-full">
      <thead className="sticky top-0 bg-white z-10 w-full shadow-md">
        {table.getHeaderGroups().map((headerGroup) => (
          <TableHeaderRow
            key={headerGroup.id}
            headerGroup={headerGroup}
            columns={columns}
            tableId={tableId}
          />
        ))}
      </thead>

      <tbody>
        {table.getRowModel().rows.map((row, index) => (
          <TableBodyRow
            key={row.id}
            row={row}
            rowIndex={index}
            columns={columns}
          />
        ))}
      </tbody>
    </table>
  );
}
