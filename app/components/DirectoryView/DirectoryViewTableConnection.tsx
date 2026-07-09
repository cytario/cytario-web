import { useMemo } from "react";

import { type TreeNode } from "./buildDirectoryTree";
import { type ConnectionConfig } from "~/.generated/client";
import { NodeLink } from "~/components/DirectoryView/NodeLink/NodeLink";
import { BucketPolicyStatusPill } from "~/components/Pills/BucketPolicyStatusPill";
import { ScopePill } from "~/components/Pills/ScopePill";
import { CellRenderers, ColumnConfig, Table } from "~/components/Table/Table";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

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
    id: "scope",
    header: "Scope",
    size: 160,
    enableSorting: true,
    enableColumnFilter: true,
    filterType: "select",
    filterRender: (option) => <ScopePill scope={option.value} />,
  },
  {
    id: "bucketName",
    header: "Bucket",
    size: 260,
    enableSorting: true,
    copyable: true,
  },
  {
    id: "prefix",
    header: "Prefix",
    size: 260,
    enableSorting: true,
    defaultVisible: false,
    copyable: true,
  },
  {
    id: "bucketPolicyStatus",
    header: "Policy",
    size: 160,
    enableSorting: true,
    enableColumnFilter: true,
    filterType: "select",
    filterRender: (option) => (
      <BucketPolicyStatusPill status={option.value as ConnectionConfig["bucketPolicyStatus"]} />
    ),
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

/**
 * Builds the cell renderer map for the connections table. Captured here as a
 * factory so the `name` renderer can close over the `nodes` array and look up
 * the TreeNode by `connectionName` (NodeLink needs the full node for status
 * + context menu wiring).
 */
function buildConnectionCellRenderers(nodes: TreeNode[]): CellRenderers<ConnectionConfig> {
  const nodesByName = new Map(nodes.map((n) => [n.connectionName, n]));
  return {
    name: (row) => {
      const node = nodesByName.get(row.name);
      return node ? <NodeLink node={node} /> : row.name;
    },
    scope: (row) => <ScopePill scope={row.scope} />,
    bucketPolicyStatus: (row) => <BucketPolicyStatusPill status={row.bucketPolicyStatus} />,
  };
}

interface DirectoryViewTableConnectionProps {
  nodes: TreeNode[];
  showFilters?: boolean;
}

export function DirectoryViewTableConnection({
  nodes,
  showFilters = false,
}: DirectoryViewTableConnectionProps) {
  const connections = useConnectionsStore(select.connections);

  const data = useMemo(
    () => nodes.map((n) => connections[n.connectionName]?.connectionConfig).filter(Boolean),
    [nodes, connections],
  );

  const cellRenderers = useMemo(() => buildConnectionCellRenderers(nodes), [nodes]);

  return (
    <Table
      columns={connectionColumns}
      data={data}
      getRowId={(row) => row.name}
      cellRenderers={cellRenderers}
      tableId="connections"
      ariaLabel="Connections"
      showFilters={showFilters}
    />
  );
}
