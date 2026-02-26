import type { ColumnFiltersState, OnChangeFn } from "@tanstack/react-table";

import { IconButton, Input, Select } from "../Controls";
import { H3 } from "../Fonts";
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
    setColumnFilters((prev) => {
      const without = prev.filter((f) => f.id !== columnId);
      if (!value) return without;
      return [...without, { id: columnId, value }];
    });
  };

  const clearAll = () => setColumnFilters([]);

  return (
    <aside className="w-80 min-h-full shrink-0 space-y-3 border-r border-slate-300 bg-slate-50">
      <header className="flex items-center justify-between bg-slate-100 p-2 border-b border-slate-300">
        <H3 className="">Filters</H3>
        {hasActiveFilters && (
          <IconButton
            icon="FilterX"
            scale="small"
            theme="white"
            onClick={clearAll}
            label="Clear all filters"
          />
        )}
      </header>

      {filterableColumns.map((col) => {
        const filterValue = getFilterValue(col.id);

        return (
          <div key={col.id} className="flex flex-col gap-1 p-2">
            <label className="text-xs font-medium text-slate-500">
              {col.header}
            </label>
            {col.filterType === "select" ? (
              <Select
                options={col.filterOptions ?? []}
                value={filterValue}
                onChange={(value) => setFilter(col.id, value || undefined)}
                aria-label={`Filter by ${col.header}`}
              />
            ) : (
              <Input
                value={filterValue}
                onChange={(e) => setFilter(col.id, e.target.value || undefined)}
                placeholder={col.filterPlaceholder ?? `Filter ${col.header}...`}
                aria-label={`Filter by ${col.header}`}
              />
            )}
          </div>
        );
      })}
    </aside>
  );
}
