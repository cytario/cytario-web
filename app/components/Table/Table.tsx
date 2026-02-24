import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getFacetedUniqueValues,
  ColumnDef,
} from "@tanstack/react-table";
import { ReactNode, useMemo } from "react";

import { TableBodyRow } from "./TableBodyRow";
import { TableHeaderRow } from "./TableHeaderRow";
import { CellRenderers, TableProps as TablePropsType } from "./types";
import { useColumnFilters } from "./useColumnFilters";
import { useColumnVisibility } from "./useColumnVisibility";
import { useColumnWidths } from "./useColumnWidths";
import { useTableSorting } from "./useTableSorting";

// Re-export types for external use
export type { ColumnConfig, TableProps, CellRenderers } from "./types";

export function Table<TData extends Record<string, unknown>>({
  columns,
  data,
  cellRenderers = {} as CellRenderers<TData>,
  tableId = "default",
}: TablePropsType<TData>) {
  const { columnSizing, setColumnSizing } = useColumnWidths(columns, tableId);
  const anchorColumnId = columns.find((c) => c.anchor)?.id ?? columns[0]?.id;
  const { sorting, setSorting } = useTableSorting(tableId, anchorColumnId);
  const {
    columnVisibility,
    setColumnVisibility,
    toggleableColumns,
    toggleColumn,
  } = useColumnVisibility(columns, tableId);
  const { columnFilters, setColumnFilters } = useColumnFilters(tableId);

  const columnDefs: ColumnDef<TData>[] = useMemo(() => {
    const indexColumn: ColumnDef<TData> = {
      id: "index",
      header: "",
      cell: (info) => info.row.index + 1,
      enableResizing: false,
      enableSorting: false,
      enableColumnFilter: false,
      size: 48,
      minSize: 48,
      maxSize: 48,
    };

    const dataColumns = columns.map((colConfig): ColumnDef<TData> => {
      const renderer = cellRenderers[colConfig.id];

      return {
        id: colConfig.id,
        accessorKey: colConfig.id as string & keyof TData,
        header: colConfig.header,
        cell: renderer
          ? (info) => renderer(info.row.original)
          : (info) => info.getValue() as ReactNode,
        enableResizing: colConfig.enableResizing !== false,
        enableSorting: colConfig.enableSorting ?? false,
        enableColumnFilter: colConfig.enableColumnFilter ?? false,
        sortingFn: colConfig.sortingFn ?? "alphanumeric",
        size: columnSizing[colConfig.id] ?? colConfig.size ?? 150,
        minSize: colConfig.minSize ?? 48,
        maxSize: colConfig.maxSize ?? Number.MAX_SAFE_INTEGER,
      };
    });

    return [indexColumn, ...dataColumns];
  }, [columns, cellRenderers, columnSizing]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    enableSortingRemoval: false,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: {
      columnSizing,
      sorting,
      columnVisibility,
      columnFilters,
    },
    onColumnSizingChange: setColumnSizing,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
  });

  return (
    <table className="min-w-full">
      <thead className="sticky top-0 bg-white z-10 w-full">
        {table.getHeaderGroups().map((headerGroup) => (
          <TableHeaderRow
            key={headerGroup.id}
            headerGroup={headerGroup}
            columns={columns}
            tableId={tableId}
            toggleableColumns={toggleableColumns}
            columnVisibility={columnVisibility}
            toggleColumn={toggleColumn}
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
