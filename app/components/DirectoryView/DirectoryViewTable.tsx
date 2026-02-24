import { filesize } from "filesize";
import { useMemo } from "react";

import { TreeNode, TreeNodeType } from "./buildDirectoryTree";
import { NodeLink } from "./NodeLink/NodeLink";
import { CellRenderers, ColumnConfig, Table } from "~/components/Table/Table";
import { useConnectionsStore } from "~/utils/connectionsStore";
import { formatHumanReadableDate } from "~/utils/formatHumanReadableDate";

// --- Bucket view ---

interface BucketRow {
  [key: string]: unknown;
  name: string;
  provider: string;
  endpoint: string;
  region: string;
  rolearn: string;
  ownerScope: string;
  createdBy: string;
  _node: TreeNode;
}

const bucketColumns: ColumnConfig[] = [
  {
    id: "name",
    header: "Name",
    size: 420,
    enableSorting: true,
    anchor: true,
    enableColumnFilter: true,
    filterType: "text",
  },
  {
    id: "provider",
    header: "Provider",
    size: 100,
    enableSorting: true,
    enableColumnFilter: true,
    filterType: "select",
  },
  { id: "endpoint", header: "Endpoint", size: 340, enableSorting: true },
  {
    id: "region",
    header: "Region",
    size: 120,
    enableSorting: true,
    enableColumnFilter: true,
    filterType: "select",
  },
  {
    id: "rolearn",
    header: "RoleARN",
    size: 480,
    enableSorting: true,
    defaultVisible: false,
  },
  {
    id: "ownerScope",
    header: "Scope",
    size: 160,
    enableSorting: true,
    enableColumnFilter: true,
    filterType: "select",
  },
  { id: "createdBy", header: "Created By", size: 280, enableSorting: true },
];

const bucketCellRenderers: CellRenderers<BucketRow> = {
  name: (row) => <NodeLink node={row._node} viewMode="list" />,
};

// --- File/directory view ---

interface FileRow {
  [key: string]: unknown;
  name: string;
  last_modified: string;
  size: string;
  _node: TreeNode;
}

const fileColumns: ColumnConfig[] = [
  { id: "name", header: "Name", size: 420, enableSorting: true, anchor: true },
  {
    id: "last_modified",
    header: "Last Modified",
    size: 420,
    align: "right",
    enableSorting: true,
    sortingFn: "datetime",
  },
  {
    id: "size",
    header: "Size",
    size: 120,
    align: "right",
    enableSorting: true,
  },
];

const fileCellRenderers: CellRenderers<FileRow> = {
  name: (row) => <NodeLink node={row._node} viewMode="list" />,
};

// --- Component ---

export type TableType = Extract<TreeNodeType, "bucket" | "directory">;

export function DirectoryViewTable({ nodes }: { nodes: TreeNode[] }) {
  const connections = useConnectionsStore((state) => state.connections);

  const tableType: TableType =
    nodes[0].type === "bucket" ? "bucket" : "directory";

  const bucketData: BucketRow[] = useMemo(() => {
    if (tableType !== "bucket") return [];
    return nodes.map((node) => {
      const storeKey = `${node.provider}/${node.bucketName}`;
      const config = connections[storeKey]?.bucketConfig;
      return {
        name: node.name,
        provider: config?.provider ?? "",
        endpoint: config?.endpoint ?? "",
        region: config?.region ?? "",
        rolearn: config?.roleArn ?? "",
        ownerScope: config?.ownerScope ?? "",
        createdBy: config?.createdBy ?? "",
        _node: node,
      };
    });
  }, [tableType, nodes, connections]);

  const fileData: FileRow[] = useMemo(() => {
    if (tableType === "bucket") return [];
    return nodes.map((node) => {
      const isFile = node.type === "file";
      return {
        name: node.name,
        last_modified:
          isFile && node._Object?.LastModified
            ? formatHumanReadableDate(node._Object.LastModified)
            : "",
        size:
          isFile && node._Object
            ? filesize(node._Object.Size ?? 0).toString()
            : "",
        _node: node,
      };
    });
  }, [tableType, nodes]);

  if (tableType === "bucket") {
    return (
      <div className="overflow-x-auto">
        <Table
          columns={bucketColumns}
          data={bucketData}
          cellRenderers={bucketCellRenderers}
          tableId="bucket"
        />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table
        columns={fileColumns}
        data={fileData}
        cellRenderers={fileCellRenderers}
        tableId="directory"
      />
    </div>
  );
}
