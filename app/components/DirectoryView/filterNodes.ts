import type { ColumnFiltersState } from "@tanstack/react-table";

import type { TreeNode } from "./buildDirectoryTree";
import type { DirectoryKind } from "./DirectoryView";
import type { ColumnConfig } from "~/components/Table/types";
import type { Connection } from "~/utils/connectionsStore/useConnectionsStore";
import { getFileType } from "~/utils/fileType";

type NodeAccessor = (node: TreeNode) => string;

const fileAccessors: Record<string, NodeAccessor> = {
  name: (node) => node.name,
  file_type: (node) => (node.type === "file" ? getFileType(node.name) : "Directory"),
};

function makeConnectionAccessors(
  connections: Record<string, Connection>,
): Record<string, NodeAccessor> {
  const config = (node: TreeNode) => connections[node.connectionName]?.connectionConfig;
  return {
    name: (node) => node.name,
    provider: (node) => config(node)?.provider ?? "",
    ownerScope: (node) => config(node)?.ownerScope ?? "",
    region: (node) => config(node)?.region ?? "",
  };
}

export function getNodeAccessors(
  kind: DirectoryKind,
  connections: Record<string, Connection> = {},
): Record<string, NodeAccessor> {
  return kind === "connections" ? makeConnectionAccessors(connections) : fileAccessors;
}

/** Filter hidden files (names starting with ".") recursively. */
export function filterHiddenNodes(nodes: TreeNode[], showHidden: boolean): TreeNode[] {
  if (showHidden) return nodes;

  return nodes
    .filter((node) => !node.name.startsWith("."))
    .map((node) =>
      node.children && node.children.length > 0
        ? { ...node, children: filterHiddenNodes(node.children, false) }
        : node,
    );
}

/**
 * Filter `TreeNode[]` using the same column-filter semantics as the Table.
 * Text filters use case-insensitive substring; select filters use exact match.
 */
export function filterNodes(
  nodes: TreeNode[],
  columnFilters: ColumnFiltersState,
  columns: ColumnConfig[],
  kind: DirectoryKind = "entries",
  connections: Record<string, Connection> = {},
): TreeNode[] {
  if (columnFilters.length === 0) return nodes;

  const accessors = getNodeAccessors(kind, connections);

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
