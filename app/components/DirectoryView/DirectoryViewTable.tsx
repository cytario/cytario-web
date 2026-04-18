import { Pill } from "@cytario/design";
import type { ColumnFiltersState, OnChangeFn } from "@tanstack/react-table";
import { filesize } from "filesize";
import { useMemo } from "react";
import { Link } from "react-router";

import {
  TreeNode,
  TreeNodeType,
  computeDirectorySize,
  computeDirectoryLastModified,
} from "./buildDirectoryTree";
import { ProviderPill } from "~/components/Pills/ProviderPill";
import { ScopePill } from "~/components/Pills/ScopePill";
import { CellRenderers, ColumnConfig, Table } from "~/components/Table/Table";
import { useConnectionsStore } from "~/utils/connectionsStore";
import { getFileType } from "~/utils/fileType";
import { formatHumanReadableDate } from "~/utils/formatHumanReadableDate";

// --- Connection view ---

interface ConnectionRow {
  id: string;
  name: string;
  provider: string;
  endpoint: string;
  region: string;
  rolearn: string;
  ownerScope: string;
  createdBy: string;
}

export const connectionColumns: ColumnConfig[] = [
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
    filterRender: (option) => <ScopePill scope={option.value} />,
  },
  {
    id: "provider",
    header: "Provider",
    size: 160,
    enableSorting: true,
    enableColumnFilter: true,
    filterType: "select",
    filterRender: (option) => <ProviderPill provider={option.value} />,
  },
  {
    id: "endpoint",
    header: "Endpoint",
    size: 340,
    enableSorting: true,
    defaultVisible: false,
    copyable: true,
  },
  {
    id: "region",
    header: "Region",
    size: 160,
    enableSorting: true,
    enableColumnFilter: true,
    filterType: "select",
    copyable: true,
  },
  {
    id: "rolearn",
    header: "RoleARN",
    size: 480,
    enableSorting: true,
    defaultVisible: false,
    copyable: true,
  },
  {
    id: "createdBy",
    header: "Created By",
    size: 280,
    enableSorting: true,
    defaultVisible: false,
    copyable: true,
  },
];

// TODO(C-151): the name cell should render `[activity indicator] name` to
// match the grid's StorageConnectionCard visual. Blocked on extracting a
// StatusDot atom from @cytario/design and wiring real connection status.
const connectionCellRenderers: CellRenderers<ConnectionRow> = {
  name: (row) => <Link to={`/connections/${row.id}`}>{row.name}</Link>,
  ownerScope: (row) => <ScopePill scope={row.ownerScope} />,
  provider: (row) => <ProviderPill provider={row.provider} />,
};

// --- File/directory view ---

interface FileRow {
  id: string;
  name: string;
  file_type: string;
  last_modified: number;
  size: number;
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
    filterRender: (option) => <Pill>{option.value}</Pill>,
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

// TODO(C-151): the name cell should render `[type icon] name` (folder icon
// for directories, file-type icon for files) to match the grid's FileCard.
const fileCellRenderers: CellRenderers<FileRow> = {
  name: (row) => <Link to={`/connections/${row.id}`}>{row.name}</Link>,
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

  const connectionData: ConnectionRow[] = useMemo(
    () =>
      nodes.flatMap((node) => {
        const config = connections[node.connectionName]?.connectionConfig;
        if (!config) return [];
        return {
          id: node.id,
          name: node.name,
          provider: config.provider,
          endpoint: config.endpoint,
          region: config.region ?? "",
          rolearn: config.roleArn ?? "",
          ownerScope: config.ownerScope,
          createdBy: config.createdBy,
        };
      }),
    [nodes, connections],
  );

  const fileData: FileRow[] = useMemo(
    () =>
      nodes.map((node) => {
        const isFile = node.type === "file";
        return {
          id: node.id,
          name: node.name,
          file_type: isFile ? getFileType(node.name) : "Directory",
          last_modified: isFile
            ? node._Object?.LastModified
              ? new Date(node._Object.LastModified).getTime()
              : 0
            : computeDirectoryLastModified(node),
          size: isFile ? (node._Object?.Size ?? 0) : computeDirectorySize(node),
        };
      }),
    [nodes],
  );

  if (tableType === "bucket") {
    return (
      <Table
        columns={connectionColumns}
        data={connectionData}
        cellRenderers={connectionCellRenderers}
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
