import type { ColumnFiltersState } from "@tanstack/react-table";

import type { TreeNode } from "./buildDirectoryTree";
import type { ColumnConfig } from "~/components/Table/types";
import { getFileType } from "~/utils/fileType";

type NodeAccessor = (node: TreeNode) => string;

const fileAccessors: Record<string, NodeAccessor> = {
  name: (node) => node.name,
  file_type: (node) =>
    node.type === "file" ? getFileType(node.name) : "Directory",
};

const bucketAccessors: Record<string, NodeAccessor> = {
  name: (node) => node.name,
  provider: (node) => node.provider,
};

/**
 * Filters TreeNode[] using the same column filter semantics as the Table.
 * Text filters use case-insensitive substring matching; select filters use
 * exact match. Columns without a matching accessor are skipped.
 */
export function filterNodes(
  nodes: TreeNode[],
  columnFilters: ColumnFiltersState,
  columns: ColumnConfig[],
  isBucket = false,
): TreeNode[] {
  if (columnFilters.length === 0) return nodes;

  const accessors = isBucket ? bucketAccessors : fileAccessors;

  return nodes.filter((node) =>
    columnFilters.every((filter) => {
      const accessor = accessors[filter.id];
      if (!accessor) return true;

      const value = accessor(node);
      const filterValue = String(filter.value);
      if (!filterValue) return true;

      const col = columns.find((c) => c.id === filter.id);
      if (col?.filterType === "select") {
        return value === filterValue;
      }
      return value.toLowerCase().includes(filterValue.toLowerCase());
    }),
  );
}
