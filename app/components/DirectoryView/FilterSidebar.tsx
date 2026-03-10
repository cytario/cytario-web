import { H3, IconButton, Switch } from "@cytario/design";
import type { ColumnFiltersState, OnChangeFn } from "@tanstack/react-table";
import { FilterX, PanelLeft, PanelLeftClose } from "lucide-react";

import { IndexStatus } from "./IndexStatus";
import { useLayoutStore } from "./useLayoutStore";
import { Input } from "../Controls";
import type { ColumnConfig } from "~/components/Table/types";

interface FilterSidebarProps {
  columns: ColumnConfig[];
  columnFilters: ColumnFiltersState;
  setColumnFilters: OnChangeFn<ColumnFiltersState>;
  /** Connection alias — when provided, renders <IndexStatus> in the sidebar. */
  alias?: string;
  /** When true, show column filter inputs (typically only in grid mode). */
  showColumnFilters?: boolean;
}

/**
 * Collapsible sidebar for directory filtering controls.
 *
 * When collapsed, renders a narrow strip with a toggle button.
 * When expanded, shows index status (if alias is provided), a "show hidden
 * files" toggle, and optional column filter inputs.
 */
export function FilterSidebar({
  columns,
  columnFilters,
  setColumnFilters,
  alias,
  showColumnFilters = true,
}: FilterSidebarProps) {
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);
  const setSidebarOpen = useLayoutStore((s) => s.setSidebarOpen);
  const showHiddenFiles = useLayoutStore((s) => s.showHiddenFiles);
  const toggleShowHiddenFiles = useLayoutStore((s) => s.toggleShowHiddenFiles);

  // Collapsed state: narrow strip with toggle button
  if (!sidebarOpen) {
    return (
      <aside className="flex w-10 min-h-full shrink-0 flex-col items-center border-r border-slate-300 bg-slate-50 pt-2">
        <IconButton
          icon={PanelLeft}
          size="sm"
          variant="secondary"
          onPress={() => setSidebarOpen(true)}
          aria-label="Open filters sidebar"
        />
      </aside>
    );
  }

  const filterableColumns = columns.filter((col) => col.enableColumnFilter);
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

  // Expanded state
  return (
    <aside className="w-80 min-h-full shrink-0 space-y-3 border-r border-slate-300 bg-slate-50">
      {/* Header */}
      <header className="flex items-center justify-between bg-slate-100 p-2 border-b border-slate-300">
        <H3>Filters</H3>
        <div className="flex items-center gap-1">
          {hasActiveFilters && (
            <IconButton
              icon={FilterX}
              size="sm"
              variant="secondary"
              onPress={clearAll}
              aria-label="Clear all filters"
            />
          )}
          <IconButton
            icon={PanelLeftClose}
            size="sm"
            variant="secondary"
            onPress={() => setSidebarOpen(false)}
            aria-label="Close filters sidebar"
          />
        </div>
      </header>

      {/* Index Status (only when alias is provided) */}
      {alias && (
        <div className="px-2">
          <IndexStatus alias={alias} />
        </div>
      )}

      {/* Show hidden files toggle */}
      <div className="flex items-center justify-between gap-2 px-2">
        <label
          htmlFor="show-hidden-files"
          className="text-xs font-medium text-slate-500"
        >
          Show hidden files
        </label>
        <Switch
          id="show-hidden-files"
          isSelected={showHiddenFiles}
          onChange={toggleShowHiddenFiles}
        />
      </div>

      {/* Column filter inputs (only when showColumnFilters is true) */}
      {showColumnFilters &&
        filterableColumns.map((col) => {
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
