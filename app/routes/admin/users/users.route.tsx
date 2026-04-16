import {
  Badge,
  Banner,
  Button,
  ButtonLink,
  EmptyState,
  Pill,
} from "@cytario/design";
import { type RowSelectionState } from "@tanstack/react-table";
import { FolderPlus, Plug, UserPlus, Users, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import {
  type MetaFunction,
  type ShouldRevalidateFunction,
  Link,
  Outlet,
  useLoaderData,
} from "react-router";

import { BulkActions } from "./BulkActions";
import type { ConnectionConfig } from "~/.generated/client";
import { authMiddleware } from "~/.server/auth/authMiddleware";
import {
  type UserWithGroups,
  type GroupInfo,
} from "~/.server/auth/keycloakAdmin";
import { Container, Section, SectionHeader } from "~/components/Container";
import { ProviderPill } from "~/components/Pills/ProviderPill";
import { ScopePill } from "~/components/Pills/ScopePill";
import { SelectionFooter } from "~/components/Table/SelectionFooter";
import {
  type CellRenderers,
  type ColumnConfig,
  Table,
} from "~/components/Table/Table";
import { useModal } from "~/hooks/useModal";

export const meta: MetaFunction = () => [{ title: "Admin — Users" }];

export const middleware = [authMiddleware];

export { bulkUsersAction as action } from "./bulkUsers.action";
export { usersLoader as loader } from "./users.loader";

export const shouldRevalidate: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  formAction,
  defaultShouldRevalidate,
}) => {
  if (formAction) return defaultShouldRevalidate;
  return (
    currentUrl.searchParams.get("scope") !== nextUrl.searchParams.get("scope")
  );
};

interface UserRow {
  name: string;
  userId: string;
  email: string;
  enabled: string;
  groups: string;
  _scope: string;
  [key: string]: unknown;
}

function buildGroupColumn(
  id: string,
  header: string,
  allGroups: GroupInfo[],
  counts: Map<string, number>,
  totalCount: number,
  {
    pillVisibleCount,
    ...extra
  }: Partial<ColumnConfig> & { pillVisibleCount?: number } = {},
): ColumnConfig {
  const options = [
    { label: "All", value: "" },
    ...allGroups.map((g) => ({ label: g.path, value: g.path })),
  ];

  return {
    id,
    header,
    size: 300,
    enableSorting: true,
    enableColumnFilter: true,
    filterType: "select",
    filterOptions: options,
    filterFn: (row, columnId, filterValue) => {
      const paths = row.getValue<string>(columnId).split(", ");
      return paths.includes(filterValue);
    },
    filterRender: (option) => {
      const count = option.value ? (counts.get(option.value) ?? 0) : totalCount;
      const pill = option.value ? (
        <ScopePill scope={option.value} visibleCount={pillVisibleCount} />
      ) : (
        <Pill color="slate">All</Pill>
      );
      return (
        <span className="flex w-full items-center justify-between gap-2">
          {pill}
          <Badge variant="slate" className="ml-auto shrink-0 tabular-nums">
            {count}
          </Badge>
        </span>
      );
    },
    ...extra,
  };
}

function buildColumns(
  groups: GroupInfo[],
  groupCounts: Map<string, number>,
  totalCount: number,
): ColumnConfig[] {
  return [
    {
      id: "name",
      header: "Name",
      size: 200,
      enableSorting: true,
      anchor: true,
      enableColumnFilter: true,
      filterType: "text",
    },
    {
      id: "userId",
      header: "ID",
      size: 300,
      enableSorting: true,
      enableColumnFilter: true,
      filterType: "text",
      defaultVisible: false,
      monospace: true,
      ellipsis: "middle",
      copyable: true,
    },
    {
      id: "email",
      header: "Email",
      size: 250,
      enableSorting: true,
      enableColumnFilter: true,
      filterType: "text",
      ellipsis: "middle",
      copyable: true,
    },
    {
      id: "enabled",
      header: "Status",
      size: 120,
      enableSorting: true,
      sortingFn: "alphanumeric" as const,
      enableColumnFilter: true,
      filterType: "select",
      filterOptions: [
        { label: "All", value: "" },
        { label: "Active", value: "true" },
        { label: "Disabled", value: "false" },
      ],
      filterRender: (option) => {
        const label =
          option.value === "true"
            ? "Active"
            : option.value === "false"
              ? "Disabled"
              : option.label;
        return (
          <Pill color={option.value === "true" ? "green" : "slate"}>
            {label}
          </Pill>
        );
      },
    },
    buildGroupColumn(
      "groups",
      "Groups",
      groups,
      groupCounts,
      totalCount,
    ),
  ];
}

const cellRenderers: CellRenderers<UserRow> = {
  name: (row) => (
    <Link
      to={`${row.userId}?scope=${encodeURIComponent(row._scope)}`}
      className="text-cytario-turquoise-700 hover:underline"
    >
      {row.name}
    </Link>
  ),
  enabled: (row) => {
    const label = row.enabled === "true" ? "Active" : "Disabled";
    return (
      <Pill color={row.enabled === "true" ? "green" : "slate"}>{label}</Pill>
    );
  },
  groups: (row) => (
    <div className="flex flex-wrap gap-1">
      {row.groups
        .split(", ")
        .filter(Boolean)
        .map((path) => (
          <ScopePill key={path} scope={path} />
        ))}
    </div>
  ),
};

export default function AdminUsersRoute() {
  const { scope, users, groups, connections } = useLoaderData<{
    scope: string;
    users: UserWithGroups[];
    groups: GroupInfo[];
    connections: ConnectionConfig[];
  }>();

  const { openModal } = useModal();
  const tableId = `admin-users-${scope}`;
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const selectedCount = Object.keys(rowSelection).length;

  const data: UserRow[] = useMemo(
    () =>
      users.map(({ user, groupPaths }) => ({
        name: `${user.firstName} ${user.lastName}`,
        userId: user.id,
        email: user.email ?? "",
        enabled: String(user.enabled),
        groups: [...groupPaths].join(", "),
        _scope: scope,
      })),
    [users, scope],
  );

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of data) {
      for (const path of row.groups.split(", ").filter(Boolean)) {
        counts.set(path, (counts.get(path) ?? 0) + 1);
      }
    }
    return counts;
  }, [data]);

  const columns = useMemo(
    () => buildColumns(groups, groupCounts, data.length),
    [groups, groupCounts, data.length],
  );

  return (
    <Section>
      <SectionHeader name={scope}>
        <span className="text-sm text-slate-500">
          {data.length} {data.length === 1 ? "user" : "users"}
        </span>
        <ButtonLink
          href={`/admin/users/create-group?scope=${encodeURIComponent(scope)}`}
          variant="secondary"
          iconLeft={FolderPlus}
        >
          Create Group
        </ButtonLink>
        <ButtonLink
          href={`/admin/users/invite?scope=${encodeURIComponent(scope)}`}
          variant="secondary"
          iconLeft={UserPlus}
        >
          Invite User
        </ButtonLink>
        <ButtonLink
          href={`/admin/users/bulk-invite?scope=${encodeURIComponent(scope)}`}
          variant="secondary"
          iconLeft={UsersRound}
        >
          Bulk Invite
        </ButtonLink>
        <Button
          variant="secondary"
          iconLeft={Plug}
          onPress={() => openModal("add-connection")}
        >
          Connect Storage
        </Button>
      </SectionHeader>

      <Container>
        <section aria-labelledby="connections-heading" className="mb-6">
          <h3
            id="connections-heading"
            className="text-sm font-medium text-slate-500 mb-2"
          >
            Connections
          </h3>
          {connections.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {connections.map((conn) => (
                <li key={conn.name}>
                  <Link
                    to={`/connections/${encodeURIComponent(conn.name)}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm hover:border-slate-300 hover:bg-white transition-colors"
                  >
                    <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                    <span className="font-medium text-cytario-turquoise-700 hover:underline">
                      {conn.name}
                    </span>
                    <ProviderPill provider={conn.provider} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Banner
              variant="warning"
              title="No connections linked to this group"
            >
              Members won&apos;t be able to access any data until you connect
              storage.
            </Banner>
          )}
        </section>

        {data.length > 0 ? (
          <Table
            columns={columns}
            data={data}
            cellRenderers={cellRenderers}
            tableId={tableId}
            enableRowSelection
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            getRowId={(row) => row.userId}
            showFilters
          />
        ) : (
          <EmptyState
            icon={Users}
            title="No users yet"
            description="Invite team members to get started."
            action={
              <ButtonLink
                href={`/admin/users/invite?scope=${encodeURIComponent(scope)}`}
                size="lg"
              >
                Invite User
              </ButtonLink>
            }
          />
        )}
        {selectedCount > 0 && (
          <SelectionFooter
            selectedCount={selectedCount}
            totalCount={data.length}
            onReset={() => setRowSelection({})}
          >
            <BulkActions
              selectedUserIds={Object.keys(rowSelection)}
              users={users}
              groups={groups}
              onSuccess={() => setRowSelection({})}
            />
          </SelectionFooter>
        )}
      </Container>
      <Outlet context={{ scope, users, groups }} />
    </Section>
  );
}
