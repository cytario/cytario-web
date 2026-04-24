import { useMemo } from "react";
import { Link } from "react-router";

import { type TreeNode } from "./buildDirectoryTree";
import { type ConnectionConfig } from "~/.generated/client";
import { ProviderPill } from "~/components/Pills/ProviderPill";
import { ScopePill } from "~/components/Pills/ScopePill";
import { CellRenderers, ColumnConfig, Table } from "~/components/Table/Table";
import { select, useConnectionsStore } from "~/utils/connectionsStore";

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
    id: "roleArn",
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

const connectionCellRenderers: CellRenderers<ConnectionConfig> = {
  // TODO(C-151): the name cell should render `[activity indicator] name` to
  // match the grid's StorageConnectionCard visual. Blocked on extracting a
  // StatusDot atom from @cytario/design and wiring real connection status.
  name: (row) => <Link to={`/connections/${row.name}`}>{row.name}</Link>,
  ownerScope: (row) => <ScopePill scope={row.ownerScope} />,
  provider: (row) => <ProviderPill provider={row.provider} />,
};

interface DirectoryViewTableConnectionProps {
  nodes: TreeNode[];
  showFilters?: boolean;
}

export function DirectoryViewTableConnection({
  nodes,
  showFilters = false,
}: DirectoryViewTableConnectionProps) {
  const connectionConfigs = useConnectionsStore(select.connectionConfigs);

  const data = useMemo(
    () => nodes.map((n) => connectionConfigs[n.connectionName]).filter(Boolean),
    [nodes, connectionConfigs],
  );

  return (
    <Table
      columns={connectionColumns}
      data={data}
      getRowId={(row) => row.name}
      cellRenderers={connectionCellRenderers}
      tableId="connections"
      ariaLabel="Storage connections"
      showFilters={showFilters}
    />
  );
}
