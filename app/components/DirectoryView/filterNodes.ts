import type { ColumnFiltersState } from "@tanstack/react-table";

import type { TreeNode } from "./buildDirectoryTree";
import type { DirectoryKind } from "./DirectoryView";
import type { ColumnConfig } from "~/components/Table/types";
import type { Connection } from "~/utils/connectionsStore/useConnectionsStore";
import { getFileType } from "~/utils/fileType";
import { isSidecarFilename } from "~/utils/sidecarKey";

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
    bucketName: (node) => config(node)?.bucketName ?? "",
    prefix: (node) => config(node)?.prefix ?? "",
    bucketPolicyStatus: (node) => config(node)?.bucketPolicyStatus ?? "",
    createdBy: (node) => config(node)?.createdBy ?? "",
  };
}

export function getNodeAccessors(
  kind: DirectoryKind,
  connections: Record<string, Connection> = {},
): Record<string, NodeAccessor> {
  return kind === "connections" ? makeConnectionAccessors(connections) : fileAccessors;
}

/**
 * Hidden from every directory view unless "show hidden files" is on:
 * dot-files and sidecar machinery files (annotations/settings). One
 * predicate for both, so every view hides the same set.
 */
export function isHiddenFilename(name: string): boolean {
  return name.startsWith(".") || isSidecarFilename(name);
}

/** Filter hidden files (dot-files, sidecars) recursively. */
export function filterHiddenNodes(nodes: TreeNode[], showHidden: boolean): TreeNode[] {
  if (showHidden) return nodes;

  return nodes
    .filter((node) => !isHiddenFilename(node.name))
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
