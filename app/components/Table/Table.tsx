import { Button, EmptyState } from "@cytario/design";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getFacetedUniqueValues,
  ColumnDef,
  type Row,
} from "@tanstack/react-table";
import { FilterX, SearchX } from "lucide-react";
import { ReactNode, useCallback, useMemo, useRef } from "react";

import { TableBodyRow } from "./TableBodyRow";
import { TableHeaderRow } from "./TableHeaderRow";
import { CellRenderers, TableProps as TablePropsType } from "./types";
import { useColumnFilters } from "./useColumnFilters";
import { useColumnVisibility } from "./useColumnVisibility";
import { useColumnWidths } from "./useColumnWidths";
import { useTableSorting } from "./useTableSorting";

// Re-export types for external use
export type { ColumnConfig, TableProps, CellRenderers } from "./types";

function booleanSortingFn<TData>(
  rowA: Row<TData>,
  rowB: Row<TData>,
  columnId: string,
): number {
  const a = rowA.getValue<boolean>(columnId) ? 1 : 0;
  const b = rowB.getValue<boolean>(columnId) ? 1 : 0;
  return a - b;
}

export function Table<TData extends object>({
  columns,
  data,
  cellRenderers = {} as CellRenderers<TData>,
  tableId = "default",
  ariaLabel,
  enableRowSelection,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  showFilters = true,
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
  const { columnFilters, setColumnFilters, resetFilters } = useColumnFilters({
    tableId,
  });

  const indexColumnSize = enableRowSelection ? 80 : 48;

  const columnDefs: ColumnDef<TData>[] = useMemo(() => {
    const indexColumn: ColumnDef<TData> = {
      id: "index",
      header: "",
      cell: (info) => info.row.index + 1,
      enableResizing: false,
      enableSorting: false,
      enableColumnFilter: false,
      size: indexColumnSize,
      minSize: indexColumnSize,
      maxSize: indexColumnSize,
    };

    const dataColumns = columns.map((colConfig) => {
      const renderer = cellRenderers[colConfig.id];

      return {
        id: colConfig.id,
        accessorKey: colConfig.id as string & keyof TData,
        header: colConfig.header,
        cell: renderer
          ? (info: { row: { original: TData }; getValue: () => unknown }) =>
              renderer(info.row.original)
          : (info: { getValue: () => unknown }) => info.getValue() as ReactNode,
        enableResizing: colConfig.enableResizing !== false,
        enableSorting: colConfig.enableSorting ?? false,
        enableColumnFilter: colConfig.enableColumnFilter ?? false,
        ...(colConfig.filterFn && { filterFn: colConfig.filterFn }),
        sortingFn:
          colConfig.sortingFn === "boolean"
            ? booleanSortingFn
            : (colConfig.sortingFn ?? "alphanumeric"),
        size: colConfig.size ?? 150,
        minSize: colConfig.minSize ?? 48,
        maxSize: colConfig.maxSize ?? Number.MAX_SAFE_INTEGER,
      } as ColumnDef<TData>;
    });

    return [indexColumn, ...dataColumns];
  }, [columns, cellRenderers, indexColumnSize]);

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
    enableRowSelection: !!enableRowSelection,
    state: {
      columnSizing,
      sorting,
      columnVisibility,
      columnFilters,
      ...(enableRowSelection && { rowSelection }),
    },
    onColumnSizingChange: setColumnSizing,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    ...(enableRowSelection && {
      onRowSelectionChange: onRowSelectionChange,
      getRowId: getRowId as (row: TData) => string,
    }),
  });

  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);

  const handleHeaderScroll = useCallback(() => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (headerRef.current && bodyRef.current) {
      bodyRef.current.scrollLeft = headerRef.current.scrollLeft;
    }
    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  }, []);

  const handleBodyScroll = useCallback(() => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (bodyRef.current && headerRef.current) {
      headerRef.current.scrollLeft = bodyRef.current.scrollLeft;
    }
    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  }, []);

  const filteredCount = table.getRowModel().rows.length;
  const totalCount = data.length;
  const isFiltered = filteredCount !== totalCount;

  return (
    <>
      {/* Screen-reader announcement for filter changes */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {isFiltered ? `Showing ${filteredCount} of ${totalCount} rows` : ""}
      </div>

      {/* Sticky header — sticks vertically, scrolls horizontally (hidden scrollbar) */}
      <div
        ref={headerRef}
        className="sticky top-0 z-10 bg-white border-b border-slate-300 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
        onScroll={handleHeaderScroll}
      >
        <table className="min-w-full" aria-label={ariaLabel}>
          <thead className="w-full">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableHeaderRow
                key={headerGroup.id}
                headerGroup={headerGroup}
                columns={columns}
                tableId={tableId}
                toggleableColumns={toggleableColumns}
                columnVisibility={columnVisibility}
                toggleColumn={toggleColumn}
                enableRowSelection={!!enableRowSelection}
                hasFilters={columnFilters.length > 0}
                onClearAllFilters={resetFilters}
                showFilters={showFilters}
              />
            ))}
          </thead>
        </table>
      </div>

      {/* Scrollable body — horizontal scrollbar visible */}
      <div
        ref={bodyRef}
        className="overflow-x-auto"
        onScroll={handleBodyScroll}
      >
        <table className="min-w-full" aria-hidden="true">
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1}>
                  <EmptyState
                    icon={SearchX}
                    title="No results"
                    description="No results match your filters"
                    action={
                      <Button
                        variant="secondary"
                        iconLeft={FilterX}
                        onPress={resetFilters}
                      >
                        Clear all filters
                      </Button>
                    }
                  />
                </td>
              </tr>
            ) : (
              table
                .getRowModel()
                .rows.map((row, index) => (
                  <TableBodyRow
                    key={row.id}
                    row={row}
                    rowIndex={index}
                    columns={columns}
                    enableRowSelection={!!enableRowSelection}
                  />
                ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
