import { filesize } from "filesize";
import { ReactNode } from "react";

import { TreeNode, TreeNodeType } from "./buildDirectoryTree";
import { NodeLink } from "./NodeLink/NodeLink";
import { ColumnConfig, Table } from "~/components/Table/Table";
import { useConnectionsStore } from "~/utils/connectionsStore";
import { formatHumanReadableDate } from "~/utils/formatHumanReadableDate";

const columns: Record<string, ColumnConfig> = {
  name: {
    id: "name",
    header: "Name",
    size: 420,
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
    enableSorting: true,
    sortingFn: "alphanumeric",
  },
  endpoint: {
    id: "endpoint",
    header: "Endpoint",
    size: 340,
    enableSorting: true,
    sortingFn: "alphanumeric",
  },
  region: {
    id: "region",
    header: "Region",
    size: 120,
    enableSorting: true,
    sortingFn: "alphanumeric",
  },
  rolearn: {
    id: "rolearn",
    header: "RoleARN",
    size: 480,
    enableSorting: true,
    sortingFn: "alphanumeric",
  },
  ownerScope: {
    id: "ownerScope",
    header: "Scope",
    size: 160,
    enableSorting: true,
    sortingFn: "alphanumeric",
  },
  createdBy: {
    id: "createdBy",
    header: "Created By",
    size: 280,
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
        columns.ownerScope,
        columns.createdBy,
      ];
    case "directory":
    case "file":
    default:
      return [nameColumn, columns.last_modified, columns.size];
  }
};

const getData = (
  nodes: TreeNode[],
  getBucketConfig: (
    key: string,
  ) => {
    provider?: string;
    endpoint?: string | null;
    region?: string | null;
    roleArn?: string | null;
    ownerScope?: string;
    createdBy?: string;
  } | null,
): ReactNode[][] => {
  switch (nodes[0].type) {
    case "bucket":
      return nodes.map((node) => {
        const storeKey = `${node.provider}/${node.bucketName}`;
        const bucketConfig = getBucketConfig(storeKey);

        return [
          <NodeLink key={node.name} node={node} viewMode="list" />,
          bucketConfig?.provider,
          bucketConfig?.endpoint,
          bucketConfig?.region,
          bucketConfig?.roleArn,
          bucketConfig?.ownerScope,
          bucketConfig?.createdBy,
        ];
      });

    case "directory":
    case "file":
    default:
      return nodes.map((node) => {
        // Directories show null values for now (TODO: aggregate children values)
        const isFile = node.type === "file";
        return [
          <NodeLink key={node.name} node={node} viewMode="list" />,
          isFile &&
            node._Object?.LastModified &&
            formatHumanReadableDate(node._Object.LastModified),
          isFile && node._Object && filesize(node._Object.Size ?? 0).toString(),
        ];
      });
  }
};

export type TableType = Extract<TreeNodeType, "bucket" | "directory">;

export function DirectoryViewTable({ nodes }: { nodes: TreeNode[] }) {
  const connections = useConnectionsStore((state) => state.connections);
  const getBucketConfig = (key: string) =>
    connections[key]?.bucketConfig ?? null;

  const tableType: TableType =
    nodes[0].type === "bucket" ? "bucket" : "directory";
  const columns = getColumns(nodes);
  const data = getData(nodes, getBucketConfig);

  return (
    <div className="overflow-x-auto">
      <Table columns={columns} data={data} tableId={tableType} />
    </div>
  );
}
