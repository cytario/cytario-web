import { Column } from "@tanstack/react-table";
import { useMemo } from "react";

import { Input } from "../Controls";

interface ColumnFilterInputProps {
  column: Column<unknown, unknown>;
  filterType: "text" | "select";
}

export function ColumnFilterInput({
  column,
  filterType,
}: ColumnFilterInputProps) {
  const filterValue = (column.getFilterValue() as string) ?? "";

  const sortedOptions = useMemo(() => {
    if (filterType !== "select") return [];
    const facetedValues = column.getFacetedUniqueValues();
    return Array.from(facetedValues.keys())
      .filter((v) => v != null && v !== "")
      .map(String)
      .sort();
  }, [column, filterType]);

  if (filterType === "select") {
    return (
      <select
        value={filterValue}
        onChange={(e) => column.setFilterValue(e.target.value || undefined)}
        className="h-6 w-full text-sm border border-slate-300 rounded-sm bg-white text-slate-700 px-1"
      >
        <option value="">All</option>
        {sortedOptions.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }

  return (
    <Input
      scale="small"
      value={filterValue}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      placeholder="Filter..."
    />
  );
}
