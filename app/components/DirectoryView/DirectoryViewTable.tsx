import { filesize } from "filesize";
import { ReactNode } from "react";

import { TreeNode, TreeNodeType } from "./buildDirectoryTree";
import { NodeLink } from "./NodeLink/NodeLink";
import { ColumnConfig, Table } from "~/components/Table/Table";
import { formatHumanReadableDate } from "~/utils/formatHumanReadableDate";

const columns: Record<string, ColumnConfig> = {
  name: {
    id: "name",
    header: "Name",
    size: 420,
    align: "left",
    enableSorting: true,
    // Will be overridden with function in getColumns
    sortingFn: "alphanumeric",
  },
  last_modified: {
    id: "last_modified",
    header: "Last Modified",
    size: 420,
    align: "right",
    monospace: true,
    enableSorting: true,
    sortingFn: "datetime",
  },
  size: {
    id: "size",
    header: "Size",
    size: 120,
    align: "right",
    monospace: true,
    enableSorting: true,
    sortingFn: "alphanumeric",
  },

  provider: {
    id: "provider",
    header: "Provider",
    size: 100,
    align: "left",
    enableSorting: true,
    sortingFn: "alphanumeric",
  },
  endpoint: {
    id: "endpoint",
    header: "Endpoint",
    size: 340,
    align: "left",
    enableSorting: true,
    sortingFn: "alphanumeric",
  },
  region: {
    id: "region",
    header: "Region",
    size: 120,
    align: "left",
    enableSorting: true,
    sortingFn: "alphanumeric",
  },
  rolearn: {
    id: "rolearn",
    header: "RoleARN",
    size: 480,
    align: "left",
    enableSorting: true,
    sortingFn: "alphanumeric",
  },
};

const getColumns = (nodes: TreeNode[]): ColumnConfig[] => {
  // Create name column with function-based sortingFn for ReactNode content
  const nameColumn: ColumnConfig = {
    ...columns.name,
    sortingFn: (rowIndex: number) => nodes[rowIndex]?.name ?? "",
  };

  switch (nodes[0].type) {
    case "bucket":
      return [
        nameColumn,
        columns.provider,
        columns.endpoint,
        columns.region,
        columns.rolearn,
      ];
    case "directory":
    case "file":
    default:
      return [nameColumn, columns.last_modified, columns.size];
  }
};

const getData = (nodes: TreeNode[]): ReactNode[][] => {
  switch (nodes[0].type) {
    case "bucket":
      return nodes.map((node) => {
        return [
          <NodeLink key={node.name} node={node} listStyle="list" />,
          node._Bucket?.provider,
          node._Bucket?.endpoint,
          node._Bucket?.region,
          node._Bucket?.roleArn,
        ];
      });

    case "directory":
    case "file":
    default:
      return nodes.map((node) => {
        // Directories show null values for now (TODO: aggregate children values)
        const isFile = node.type === "file";
        return [
          <NodeLink key={node.name} node={node} listStyle="list" />,
          isFile &&
            node._Object?.LastModified &&
            formatHumanReadableDate(node._Object.LastModified),
          isFile && node._Object && filesize(node._Object.Size ?? 0).toString(),
        ];
      });
  }
};

export type TableType = Extract<TreeNodeType, "bucket" | "directory">;

export function DirectoryTable({ nodes }: { nodes: TreeNode[] }) {
  const tableType: TableType =
    nodes[0].type === "bucket" ? "bucket" : "directory";
  const columns = getColumns(nodes);
  const data = getData(nodes);

  return (
    <Table columns={columns} data={data} tableId={`directory-${tableType}`} />
  );
}
