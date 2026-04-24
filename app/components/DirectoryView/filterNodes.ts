import type { ColumnFiltersState } from "@tanstack/react-table";

import type { TreeNode } from "./buildDirectoryTree";
import type { DirectoryKind } from "./DirectoryView";
import type { ConnectionConfig } from "~/.generated/client";
import type { ColumnConfig } from "~/components/Table/types";
import { getFileType } from "~/utils/fileType";

// Applies a `ColumnFiltersState` to a `TreeNode[]` so every downstream view
// (Grid, Table, Tree) receives pre-filtered data. The `ColumnFiltersState`
// shape is produced by both the Table's column-filter UI and the FilterBar,
// both writing to the same per-tableId Zustand store.
//
//   allNodes -> filteredNodes -> DirectoryView -> (Grid | Table | Tree)
//
// Filters only the current level (top-level `nodes`). Tree's hierarchical
// expansion shows descendants unfiltered; name-matching inside the tree
// relies on the design-system Tree's `searchTerm` + `searchMatch`.
type NodeAccessor = (node: TreeNode) => string;

const fileAccessors: Record<string, NodeAccessor> = {
  name: (node) => node.name,
  file_type: (node) =>
    node.type === "file" ? getFileType(node.name) : "Directory",
};

function makeConnectionAccessors(
  connectionConfigs: Record<string, ConnectionConfig>,
): Record<string, NodeAccessor> {
  const config = (node: TreeNode) => connectionConfigs[node.connectionName];
  return {
    name: (node) => node.name,
    provider: (node) => config(node)?.provider ?? "",
    ownerScope: (node) => config(node)?.ownerScope ?? "",
    region: (node) => config(node)?.region ?? "",
  };
}

export function getNodeAccessors(
  kind: DirectoryKind,
  connectionConfigs: Record<string, ConnectionConfig> = {},
): Record<string, NodeAccessor> {
  return kind === "connections"
    ? makeConnectionAccessors(connectionConfigs)
    : fileAccessors;
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
  kind: DirectoryKind = "entries",
  connectionConfigs: Record<string, ConnectionConfig> = {},
): TreeNode[] {
  if (columnFilters.length === 0) return nodes;

  const accessors = getNodeAccessors(kind, connectionConfigs);

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
