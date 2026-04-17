import type { ColumnFiltersState } from "@tanstack/react-table";

import type { TreeNode } from "./buildDirectoryTree";
import type { ColumnConfig } from "~/components/Table/types";
import type { ConnectionRecord } from "~/utils/connectionsStore/useConnectionsStore";
import { getFileType } from "~/utils/fileType";

// TODO(C-82): This hand-rolled accessor/filter logic exists because grid mode
// can't use TanStack Table's built-in column filters. Unifying filters across
// view modes (https://app.plane.so/cytario/browse/C-82/) should eliminate this file.
type NodeAccessor = (node: TreeNode) => string;

const fileAccessors: Record<string, NodeAccessor> = {
  name: (node) => node.name,
  file_type: (node) =>
    node.type === "file" ? getFileType(node.name) : "Directory",
};

function makeBucketAccessors(
  connections: Record<string, ConnectionRecord>,
): Record<string, NodeAccessor> {
  return {
    name: (node) => node.name,
    provider: (node) =>
      connections[node.connectionName]?.connectionConfig?.provider ?? "",
  };
}

/**
 * Filters hidden files (names starting with ".") unless showHidden is true.
 * Filtering is applied recursively so that hidden children inside visible
 * directories are also removed (required for the tree view).
 */
export function filterHiddenNodes(
  nodes: TreeNode[],
  showHidden: boolean,
): TreeNode[] {
  if (showHidden) return nodes;

  return nodes
    .filter((node) => !node.name.startsWith("."))
    .map((node) =>
      node.children.length > 0
        ? { ...node, children: filterHiddenNodes(node.children, false) }
        : node,
    );
}

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
  connections: Record<string, ConnectionRecord> = {},
): TreeNode[] {
  if (columnFilters.length === 0) return nodes;

  const accessors = isBucket ? makeBucketAccessors(connections) : fileAccessors;

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
