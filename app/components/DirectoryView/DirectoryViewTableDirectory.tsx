import { Pill } from "@cytario/design";
import { filesize } from "filesize";
import { useMemo } from "react";

import { TreeNode, computeDirectorySize, computeDirectoryLastModified } from "./buildDirectoryTree";
import { NodeLink } from "~/components/DirectoryView/NodeLink/NodeLink";
import { CellRenderers, ColumnConfig, Table } from "~/components/Table/Table";
import { getFileType } from "~/utils/fileType";
import { formatHumanReadableDate } from "~/utils/formatHumanReadableDate";

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

/**
 * Builds cell renderers with closure access to the original TreeNode list, so
 * the `name` renderer can hand NodeLink the full node (needed for icon
 * selection + Info-modal hookup).
 */
function buildFileCellRenderers(nodes: TreeNode[]): CellRenderers<FileRow> {
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  return {
    name: (row) => {
      const node = nodesById.get(row.id);
      return node ? <NodeLink node={node} /> : row.name;
    },
    file_type: (row) => <Pill>{row.file_type}</Pill>,
    last_modified: (row) => (row.last_modified ? formatHumanReadableDate(row.last_modified) : null),
    size: (row) => (row.size ? filesize(row.size).toString() : null),
  };
}

interface DirectoryViewTableDirectoryProps {
  nodes: TreeNode[];
  showFilters?: boolean;
}

export function DirectoryViewTableDirectory({
  nodes,
  showFilters = false,
}: DirectoryViewTableDirectoryProps) {
  const data: FileRow[] = useMemo(
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

  const cellRenderers = useMemo(() => buildFileCellRenderers(nodes), [nodes]);

  return (
    <Table
      columns={fileColumns}
      data={data}
      cellRenderers={cellRenderers}
      tableId="entries"
      ariaLabel="Files and folders"
      showFilters={showFilters}
    />
  );
}
