import {
  IconButton,
  Input,
  Pill,
  Select,
  type SelectItem,
} from "@cytario/design";
import { Column } from "@tanstack/react-table";
import { X } from "lucide-react";
import { type ReactNode, useMemo } from "react";

interface ColumnFilterInputProps {
  column: Column<unknown, unknown>;
  filterType: "text" | "select";
  filterPlaceholder?: string;
  filterOptions?: { label: string; value: string }[];
  /** Render a custom option for non-"All" values. The "All" option is
   *  always rendered as a slate Pill automatically. */
  filterRender?: (option: { label: string; value: string }) => ReactNode;
}

const ALL_KEY = "__all__";
const ALL_OPTION: SelectItem = { id: ALL_KEY, name: "All" };
const AllPill = () => <Pill color="slate">All</Pill>;

export function ColumnFilterInput({
  column,
  filterType,
  filterPlaceholder,
  filterOptions,
  filterRender,
}: ColumnFilterInputProps) {
  const filterValue = (column.getFilterValue() as string) ?? "";

  const selectItems = useMemo((): SelectItem[] => {
    if (filterType !== "select") return [];
    if (filterOptions) {
      return [
        ALL_OPTION,
        ...filterOptions
          .filter((o) => o.value !== "")
          .map((o) => ({ id: o.value, name: o.label })),
      ];
    }
    const facetedValues = column.getFacetedUniqueValues();
    return [
      ALL_OPTION,
      ...Array.from(facetedValues.keys())
        .filter((v) => v != null && v !== "")
        .map(String)
        .sort()
        .map((v) => ({ id: v, name: v })),
    ];
  }, [column, filterType, filterOptions]);

  const selectedKey = filterValue || ALL_KEY;

  const setFilter = (key: string) =>
    column.setFilterValue(key === ALL_KEY ? undefined : key);

  const clearFilter = () => column.setFilterValue(undefined);

  const renderItem = useMemo(() => {
    if (!filterRender) return undefined;
    const render = filterRender;
    function FilterOption(item: SelectItem) {
      return item.id === ALL_KEY ? (
        <AllPill />
      ) : (
        render({ label: item.name, value: item.id })
      );
    }
    return FilterOption;
  }, [filterRender]);

  return (
    <div className="flex items-center gap-1">
      {filterType === "select" ? (
        <Select
          className="w-full"
          items={selectItems}
          value={selectedKey}
          onChange={(key) => setFilter(String(key))}
          aria-label={`Filter by ${column.columnDef.header}`}
          renderItem={renderItem}
        />
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
