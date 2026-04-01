import { Pill } from "@cytario/design";
import type { ColumnFiltersState, OnChangeFn } from "@tanstack/react-table";
import { filesize } from "filesize";
import { useMemo } from "react";

import {
  TreeNode,
  TreeNodeType,
  computeDirectorySize,
  computeDirectoryLastModified,
} from "./buildDirectoryTree";
import { NodeLink } from "./NodeLink/NodeLink";
import { ProviderPill } from "~/components/Pills/ProviderPill";
import { VisibilityPill } from "~/components/Pills/VisibilityPill";
import { CellRenderers, ColumnConfig, Table } from "~/components/Table/Table";
import { useConnectionsStore } from "~/utils/connectionsStore";
import { getFileType } from "~/utils/fileType";
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

export const bucketColumns: ColumnConfig[] = [
  {
    id: "name",
    header: "Name",
    size: 420,
    enableSorting: true,
    anchor: true,
    enableColumnFilter: true,
    filterType: "text",
    filterPlaceholder: "Filter by name...",
  },
  {
    id: "ownerScope",
    header: "Scope",
    size: 160,
    enableSorting: true,
    enableColumnFilter: true,
    filterType: "select",
  },
  {
    id: "provider",
    header: "Provider",
    size: 100,
    enableSorting: true,
    enableColumnFilter: true,
    filterType: "select",
  },
  {
    id: "endpoint",
    header: "Endpoint",
    size: 340,
    enableSorting: true,
    defaultVisible: false,
  },
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
    id: "createdBy",
    header: "Created By",
    size: 280,
    enableSorting: true,
    defaultVisible: false,
  },
];

const bucketCellRenderers: CellRenderers<BucketRow> = {
  name: (row) => <NodeLink node={row._node} viewMode="list" />,
  ownerScope: (row) => <VisibilityPill scope={row.ownerScope} />,
  provider: (row) => <ProviderPill provider={row.provider} />,
};

// --- File/directory view ---

interface FileRow {
  [key: string]: unknown;
  name: string;
  file_type: string;
  last_modified: number;
  size: number;
  _node: TreeNode;
}

export const fileColumns: ColumnConfig[] = [
  {
    id: "name",
    header: "Name",
    size: 420,
    enableSorting: true,
    anchor: true,
    enableColumnFilter: true,
    filterType: "text",
    filterPlaceholder: "Filter by name...",
  },
  {
    id: "file_type",
    header: "Type",
    size: 140,
    enableSorting: true,
    enableColumnFilter: true,
    filterType: "select",
    filterOptions: [
      { label: "All", value: "" },
      { label: "CSV", value: "CSV" },
      { label: "Directory", value: "Directory" },
      { label: "JPEG", value: "JPEG" },
      { label: "JSON", value: "JSON" },
      { label: "OME-TIFF", value: "OME-TIFF" },
      { label: "PNG", value: "PNG" },
      { label: "Parquet", value: "Parquet" },
      { label: "TIFF", value: "TIFF" },
      { label: "Unknown", value: "Unknown" },
    ],
    filterRender: (option) => (
      <Pill className={option.value ? undefined : "bg-slate-200 text-slate-600"}>
        {option.value || option.label}
      </Pill>
    ),
  },
  {
    id: "last_modified",
    header: "Last Modified",
    size: 280,
    align: "right",
    enableSorting: true,
    sortingFn: "basic",
  },
  {
    id: "size",
    header: "Size",
    size: 120,
    align: "right",
    enableSorting: true,
    sortingFn: "basic",
  },
];

const fileCellRenderers: CellRenderers<FileRow> = {
  name: (row) => <NodeLink node={row._node} viewMode="list" />,
  file_type: (row) => <Pill>{row.file_type}</Pill>,
  last_modified: (row) =>
    row.last_modified ? formatHumanReadableDate(row.last_modified) : null,
  size: (row) => (row.size ? filesize(row.size).toString() : null),
};

// --- Component ---

export type TableType = Extract<TreeNodeType, "bucket" | "directory">;

interface DirectoryViewTableProps {
  nodes: TreeNode[];
  showFilters?: boolean;
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;
}

export function DirectoryViewTable({
  nodes,
  showFilters = false,
  columnFilters,
  onColumnFiltersChange,
}: DirectoryViewTableProps) {
  const connections = useConnectionsStore((state) => state.connections);

  const tableType: TableType =
    nodes[0].type === "bucket" ? "bucket" : "directory";

  const bucketData: BucketRow[] = useMemo(() => {
    if (tableType !== "bucket") return [];
    return nodes.map((node) => {
      const config = connections[node.connectionName]?.connectionConfig;
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
        file_type: isFile ? getFileType(node.name) : "Directory",
        last_modified: isFile
          ? node._Object?.LastModified
            ? new Date(node._Object.LastModified).getTime()
            : 0
          : computeDirectoryLastModified(node),
        size: isFile ? (node._Object?.Size ?? 0) : computeDirectorySize(node),
        _node: node,
      };
    });
  }, [tableType, nodes]);

  if (tableType === "bucket") {
    return (
      <Table
        columns={bucketColumns}
        data={bucketData}
        cellRenderers={bucketCellRenderers}
        tableId="bucket"
        ariaLabel="Storage connections"
        showFilters={showFilters}
      />
    );
  }

  return (
    <Table
      columns={fileColumns}
      data={fileData}
      cellRenderers={fileCellRenderers}
      tableId="directory"
      ariaLabel="Files and folders"
      columnFilters={columnFilters}
      onColumnFiltersChange={onColumnFiltersChange}
      showFilters={showFilters}
    />
  );
}
