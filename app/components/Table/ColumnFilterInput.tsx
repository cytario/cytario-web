import { IconButton, Input } from "@cytario/design";
import { Column } from "@tanstack/react-table";
import { X } from "lucide-react";
import { type ReactNode, useMemo } from "react";

interface ColumnFilterInputProps {
  column: Column<unknown, unknown>;
  filterType: "text" | "select";
  filterPlaceholder?: string;
  filterOptions?: { label: string; value: string }[];
  filterRender?: (option: { label: string; value: string }) => ReactNode;
}

export function ColumnFilterInput({
  column,
  filterType,
  filterPlaceholder,
  filterOptions,
}: ColumnFilterInputProps) {
  const filterValue = (column.getFilterValue() as string) ?? "";

  const sortedOptions = useMemo(() => {
    if (filterType !== "select") return [];
    if (filterOptions) {
      return filterOptions;
    }
    const facetedValues = column.getFacetedUniqueValues();
    return [
      { label: "All", value: "" },
      ...Array.from(facetedValues.keys())
        .filter((v) => v != null && v !== "")
        .map(String)
        .sort()
        .map((v) => ({ label: v, value: v })),
    ];
  }, [column, filterType, filterOptions]);

  const setFilter = (value: string) =>
    column.setFilterValue(value || undefined);
  const clearFilter = () => column.setFilterValue(undefined);

  return (
    <div className="flex items-center gap-1">
      {filterType === "select" ? (
        <select
          value={filterValue}
          onChange={(e) => setFilter(e.target.value)}
          aria-label={`Filter by ${column.columnDef.header}`}
          className="h-7 w-full rounded border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:border-cytario-turquoise-700 focus:outline-none focus:ring-1 focus:ring-cytario-turquoise-700"
        >
          {sortedOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          value={filterValue}
          onChange={setFilter}
          placeholder={
            filterPlaceholder ?? `Filter ${column.columnDef.header}...`
          }
          aria-label={`Filter by ${column.columnDef.header}`}
          size="sm"
        />
      )}
      {filterValue && (
        <IconButton
          // @ts-expect-error — npm-link LucideIcon type mismatch; resolves with registry install
          icon={X}
          size="sm"
          variant="ghost"
          onPress={clearFilter}
          aria-label="Clear filter"
        />
      )}
    </div>
  );
}
