import { Column } from "@tanstack/react-table";
import { ReactNode, useMemo } from "react";

import { IconButton, Input, Select } from "../Controls";

interface ColumnFilterInputProps {
  column: Column<unknown, unknown>;
  filterType: "text" | "select";
  filterOptions?: { label: string; value: string }[];
  filterRender?: (option: { label: string; value: string }) => ReactNode;
}

export function ColumnFilterInput({
  column,
  filterType,
  filterOptions,
  filterRender,
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
        <Select
          scale="small"
          options={sortedOptions}
          value={filterValue}
          onChange={setFilter}
          renderOption={filterRender}
        />
      ) : (
        <Input
          scale="small"
          value={filterValue}
          onChange={(e) => setFilter(e.target.value)}
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
