import {
  Button,
  IconButton,
  Input,
  Pill,
  Select,
  type SelectItem,
} from "@cytario/design";
import { FilterX, X } from "lucide-react";
import { type ReactNode, useMemo } from "react";

import type { ColumnConfig } from "~/components/Table/types";
import { useColumnFilters } from "~/components/Table/useColumnFilters";

const ALL_KEY = "__all__";
const ALL_OPTION: SelectItem = { id: ALL_KEY, name: "All" };
const AllPill = () => <Pill color="slate">All</Pill>;

interface FilterBarProps {
  /** Column configs — bar renders a control per column with `enableColumnFilter: true`. */
  columns: ColumnConfig[];
  /**
   * Shared `tableId` identifying the Zustand store slot.
   * All consumers (FilterBar, Table column headers, Grid/Tree `filterNodes`
   * calls) using the same tableId stay in sync automatically.
   */
  tableId: string;
  /**
   * Per-column derived options for select filters. Used when a column has no
   * static `filterOptions` — mirrors tanstack-table's `getFacetedUniqueValues`.
   */
  dynamicOptions?: Record<string, { label: string; value: string }[]>;
}

/**
 * Horizontal filter bar rendered above a DirectoryView. Mirrors the table's
 * column-header filter controls via the shared store — set a filter here, it
 * shows in the table header; clear it there, it clears here.
 *
 * Introduced in C-82 to give grid and tree views the same filter capabilities
 * as the table view.
 */
export function FilterBar({
  columns,
  tableId,
  dynamicOptions,
}: FilterBarProps) {
  const { columnFilters, setColumnFilters, resetFilters } = useColumnFilters({
    tableId,
  });

  const filterable = useMemo(
    () => columns.filter((c) => c.enableColumnFilter),
    [columns],
  );

  const hasActive = columnFilters.length > 0;

  if (filterable.length === 0) return null;

  return (
    <div className="mb-6 flex items-center gap-2 flex-wrap">
      {filterable.map((col) => (
        <FilterControl
          key={col.id}
          column={col}
          options={col.filterOptions ?? dynamicOptions?.[col.id]}
          value={
            (columnFilters.find((f) => f.id === col.id)?.value as string) ?? ""
          }
          onChange={(next) => {
            setColumnFilters((prev) => {
              const rest = prev.filter((f) => f.id !== col.id);
              return next ? [...rest, { id: col.id, value: next }] : rest;
            });
          }}
        />
      ))}
      {hasActive && (
        <Button
          variant="ghost"
          size="sm"
          iconLeft={FilterX}
          onPress={resetFilters}
        >
          Clear all
        </Button>
      )}
    </div>
  );
}

interface FilterControlProps {
  column: ColumnConfig;
  options?: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
}

function FilterControl({
  column,
  options,
  value,
  onChange,
}: FilterControlProps) {
  const clear = () => onChange("");

  if (column.filterType === "select") {
    return (
      <SelectFilter
        column={column}
        options={options}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <div className="flex items-end gap-1">
      <Input
        size="sm"
        label={column.header}
        value={value}
        onChange={onChange}
        placeholder={column.filterPlaceholder ?? `Filter ${column.header}...`}
        className="w-48"
      />
      {value && (
        <IconButton
          icon={X}
          size="sm"
          variant="ghost"
          onPress={clear}
          aria-label={`Clear ${column.header} filter`}
        />
      )}
    </div>
  );
}

function SelectFilter({
  column,
  options,
  value,
  onChange,
}: {
  column: ColumnConfig;
  options?: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const items = useMemo<SelectItem[]>(() => {
    if (!options) return [ALL_OPTION];
    return [
      ALL_OPTION,
      ...options
        .filter((o) => o.value !== "")
        .map((o) => ({ id: o.value, name: o.label })),
    ];
  }, [options]);

  const selectedKey = value || ALL_KEY;

  const renderItem = useMemo(() => {
    if (!column.filterRender) return undefined;
    const render = column.filterRender;
    function FilterOption(item: SelectItem): ReactNode {
      return item.id === ALL_KEY ? (
        <AllPill />
      ) : (
        render({ label: item.name, value: item.id })
      );
    }
    return FilterOption;
  }, [column.filterRender]);

  return (
    <Select
      size="sm"
      className="min-w-40"
      label={column.header}
      items={items}
      value={selectedKey}
      onChange={(key) => onChange(key === ALL_KEY ? "" : String(key))}
      renderItem={renderItem}
    />
  );
}
