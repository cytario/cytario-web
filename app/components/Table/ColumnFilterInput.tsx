import { Column } from "@tanstack/react-table";
import { useMemo } from "react";

import { IconButton, Input, Select, TreeSelect, type TreeNode } from "../Controls";

interface ColumnFilterInputProps {
  column: Column<unknown, unknown>;
  filterType: "text" | "select";
  filterOptions?: { label: string; value: string }[];
  filterTree?: TreeNode;
}

export function ColumnFilterInput({
  column,
  filterType,
  filterOptions,
  filterTree,
}: ColumnFilterInputProps) {
  const filterValue = (column.getFilterValue() as string) ?? "";

  const sortedOptions = useMemo(() => {
    if (filterType !== "select" || filterTree) return [];
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
  }, [column, filterType, filterOptions, filterTree]);

  const setFilter = (value: string) =>
    column.setFilterValue(value || undefined);
  const clearFilter = () => column.setFilterValue(undefined);

  return (
    <div className="flex items-center gap-1">
      {filterTree ? (
        <TreeSelect
          scale="small"
          tree={filterTree}
          value={filterValue}
          onChange={setFilter}
        />
      ) : filterType === "select" ? (
        <Select
          scale="small"
          options={sortedOptions}
          value={filterValue}
          onChange={setFilter}
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
