import { H3, IconButton } from "@cytario/design";
import type { ColumnFiltersState, OnChangeFn } from "@tanstack/react-table";
import { FilterX } from "lucide-react";

import { Input } from "../Controls";
import type { ColumnConfig } from "~/components/Table/types";

interface FilterSidebarProps {
  columns: ColumnConfig[];
  columnFilters: ColumnFiltersState;
  setColumnFilters: OnChangeFn<ColumnFiltersState>;
}

/** Vertical sidebar rendering the same filter controls as the table header. */
export function FilterSidebar({
  columns,
  columnFilters,
  setColumnFilters,
}: FilterSidebarProps) {
  const filterableColumns = columns.filter((col) => col.enableColumnFilter);

  if (filterableColumns.length === 0) return null;

  const hasActiveFilters = columnFilters.length > 0;

  const getFilterValue = (columnId: string) =>
    (columnFilters.find((f) => f.id === columnId)?.value as string) ?? "";

  const setFilter = (columnId: string, value: string | undefined) => {
    setColumnFilters((prev: ColumnFiltersState) => {
      const without = prev.filter((f) => f.id !== columnId);
      if (!value) return without;
      return [...without, { id: columnId, value }];
    });
  };

  const clearAll = () => setColumnFilters([]);

  return (
    <aside className="w-80 min-h-full shrink-0 space-y-3 border-r border-slate-300 bg-slate-50">
      <header className="flex items-center justify-between bg-slate-100 p-2 border-b border-slate-300">
        <H3>Filters</H3>
        {hasActiveFilters && (
          <IconButton
            icon={FilterX}
            size="sm"
            variant="secondary"
            onPress={clearAll}
            aria-label="Clear all filters"
          />
        )}
      </header>

      {filterableColumns.map((col) => {
        const filterValue = getFilterValue(col.id);
        const inputId = `filter-${col.id}`;

        return (
          <div key={col.id} className="flex flex-col gap-1 p-2">
            <label
              htmlFor={inputId}
              className="text-xs font-medium text-slate-500"
            >
              {col.header}
            </label>
            <Input
              id={inputId}
              value={filterValue}
              onChange={(e) => setFilter(col.id, e.target.value || undefined)}
              placeholder={col.filterPlaceholder ?? `Filter ${col.header}...`}
            />
          </div>
        );
      })}
    </aside>
  );
}
