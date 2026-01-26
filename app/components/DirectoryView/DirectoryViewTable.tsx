import { filesize } from "filesize";
import { ReactNode } from "react";

import { TreeNode } from "./buildDirectoryTree";
import { NodeLink } from "./NodeLink/NodeLink";
import { ColumnConfig, Table } from "~/components/Table";
import { formatHumanReadableDate } from "~/utils/formatHumanReadableDate";

const columns: Record<string, ColumnConfig> = {
  name: {
    id: "name",
    header: "Name",
    defaultWidth: 420,
    align: "left",
    sortable: true,
    sortType: "alphanumeric", // Will be overridden with function in getColumns
  },
  last_modified: {
    id: "last_modified",
    header: "Last Modified",
    defaultWidth: 420,
    align: "right",
    monospace: true,
    sortable: true,
    sortType: "datetime",
  },
  size: {
    id: "size",
    header: "Size",
    defaultWidth: 120,
    align: "right",
    monospace: true,
    sortable: true,
    sortType: "alphanumeric",
  },

  provider: {
    id: "provider",
    header: "Provider",
    defaultWidth: 100,
    align: "left",
    sortable: true,
    sortType: "alphanumeric",
  },
  endpoint: {
    id: "endpoint",
    header: "Endpoint",
    defaultWidth: 340,
    align: "left",
    sortable: true,
    sortType: "alphanumeric",
  },
  region: {
    id: "region",
    header: "Region",
    defaultWidth: 120,
    align: "left",
    sortable: true,
    sortType: "alphanumeric",
  },
  rolearn: {
    id: "rolearn",
    header: "RoleARN",
    defaultWidth: 480,
    align: "left",
    sortable: true,
    sortType: "alphanumeric",
  },
};

const getColumns = (nodes: TreeNode[]): ColumnConfig[] => {
  // Create name column with function-based sortType for ReactNode content
  const nameColumn: ColumnConfig = {
    ...columns.name,
    sortType: (rowIndex: number) => nodes[rowIndex]?.name ?? "",
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
      return [nameColumn];
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
      return nodes.map((node) => {
        return [<NodeLink key={node.name} node={node} listStyle="list" />];
      });
    case "file":
    default:
      return nodes.map((node) => {
        return [
          <NodeLink key={node.name} node={node} listStyle="list" />,
          node._Object?.LastModified &&
            formatHumanReadableDate(node._Object.LastModified),
          node._Object && filesize(node._Object.Size ?? 0).toString(),
        ];
      });
  }
};

export function DirectoryViewTable({ nodes }: { nodes: TreeNode[] }) {
  const columns = getColumns(nodes);
  const data = getData(nodes);
  const tableId = `directory-${nodes[0].type}`;

  return <Table columns={columns} data={data} tableId={tableId} />;
}
