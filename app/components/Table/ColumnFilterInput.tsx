import { Column } from "@tanstack/react-table";
import { useMemo } from "react";

import { Input, Select } from "../Controls";

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
    return [
      { label: "All", value: "" },
      ...Array.from(facetedValues.keys())
        .filter((v) => v != null && v !== "")
        .map(String)
        .sort()
        .map((v) => ({ label: v, value: v })),
    ];
  }, [column, filterType]);

  if (filterType === "select") {
    return (
      <Select
        scale="small"
        options={sortedOptions}
        value={filterValue}
        onChange={(value) => column.setFilterValue(value || undefined)}
      />
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
