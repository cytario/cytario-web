import { Column } from "@tanstack/react-table";
import { useMemo } from "react";

import { IconButton, Input, Select } from "../Controls";

interface ColumnFilterInputProps {
  column: Column<unknown, unknown>;
  filterType: "text" | "select";
  filterOptions?: { label: string; value: string }[];
}

export function ColumnFilterInput({
  column,
  filterType,
  filterOptions,
}: ColumnFilterInputProps) {
  const filterValue = (column.getFilterValue() as string) ?? "";

  const sortedOptions = useMemo(() => {
    if (filterType !== "select") return [];
    if (filterOptions) {
      return [{ label: "All", value: "" }, ...filterOptions];
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

  const clearFilter = () => column.setFilterValue(undefined);

  return (
    <div className="flex items-center gap-1">
      {filterType === "select" ? (
        <Select
          scale="small"
          options={sortedOptions}
          value={filterValue}
          onChange={(value) => column.setFilterValue(value || undefined)}
        />
      ) : (
        <Input
          scale="small"
          value={filterValue}
          onChange={(e) => column.setFilterValue(e.target.value || undefined)}
          placeholder="Filter..."
        />
      )}
      {filterValue && (
        <IconButton
          icon="X"
          scale="small"
          theme="secondary"
          onClick={clearFilter}
          label="Clear filter"
        />
      )}
    </div>
  );
}
