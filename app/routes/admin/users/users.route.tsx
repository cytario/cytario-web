import { useMemo } from "react";
import {
  type MetaFunction,
  type ShouldRevalidateFunction,
  Link,
  Outlet,
  useLoaderData,
} from "react-router";

import { GroupPill } from "./GroupPill";
import { authMiddleware } from "~/.server/auth/authMiddleware";
import {
  type UserWithGroups,
  type GroupInfo,
} from "~/.server/auth/keycloakAdmin";
import { Container } from "~/components/Container";
import { ButtonLink } from "~/components/Controls";
import { Icon } from "~/components/Controls/Button/Icon";
import { Placeholder } from "~/components/Placeholder";
import {
  type CellRenderers,
  type ColumnConfig,
  Table,
} from "~/components/Table/Table";

export const meta: MetaFunction = () => [{ title: "Admin — Users" }];

export const middleware = [authMiddleware];

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
  adminGroups: string;
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
  { pillVisibleCount, ...extra }: Partial<ColumnConfig> & { pillVisibleCount?: number } = {},
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
      const count = option.value
        ? counts.get(option.value) ?? 0
        : totalCount;
      const pill = option.value ? (
        <GroupPill path={option.value} visibleCount={pillVisibleCount} />
      ) : (
        <span className="h-5 px-2 rounded-full border-2 border-white bg-slate-100 text-slate-500 text-xs font-medium">
          All
        </span>
      );
      return (
        <span className="flex w-full items-center justify-between gap-2">
          {pill}
          <span className="rounded-full bg-slate-100 text-slate-500 px-1.5 text-xs tabular-nums">
            {count}
          </span>
        </span>
      );
    },
    ...extra,
  };
}

function buildColumns(
  groups: GroupInfo[],
  groupCounts: Map<string, number>,
  adminGroupCounts: Map<string, number>,
  totalCount: number,
): ColumnConfig[] {
  const nonAdminGroups = groups.filter((g) => !g.isAdmin);
  const adminGroups = groups.filter((g) => g.isAdmin);

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
      header: "Enabled",
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
    },
    buildGroupColumn(
      "adminGroups",
      "Admin Groups",
      adminGroups,
      adminGroupCounts,
      totalCount,
      { defaultVisible: false, pillVisibleCount: 2 },
    ),
    buildGroupColumn(
      "groups",
      "Groups",
      nonAdminGroups,
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
  enabled: (row) => (
    <span
      className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
        row.enabled === "true"
          ? "bg-green-100 text-green-700"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      {row.enabled === "true" ? "Active" : "Disabled"}
    </span>
  ),
  adminGroups: (row) => (
    <div className="flex flex-wrap gap-1">
      {row.adminGroups
        .split(", ")
        .filter(Boolean)
        .map((path) => (
          <GroupPill key={path} path={path} visibleCount={2} />
        ))}
    </div>
  ),
  groups: (row) => (
    <div className="flex flex-wrap gap-1">
      {row.groups
        .split(", ")
        .filter(Boolean)
        .map((path) => (
          <GroupPill key={path} path={path} />
        ))}
    </div>
  ),
};

export default function AdminUsersRoute() {
  const { scope, users, groups } = useLoaderData<{
    scope: string;
    users: UserWithGroups[];
    groups: GroupInfo[];
  }>();

  const tableId = `admin-users-${scope}`;

  const data: UserRow[] = useMemo(
    () =>
      users.map(({ user, groupPaths }) => ({
        name: `${user.firstName} ${user.lastName}`,
        userId: user.id,
        email: user.email ?? "",
        enabled: String(user.enabled),
        adminGroups: [...groupPaths]
          .filter((p) => p.endsWith("/admins"))
          .join(", "),
        groups: [...groupPaths]
          .filter((p) => !p.endsWith("/admins"))
          .join(", "),
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

  const adminGroupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of data) {
      for (const path of row.adminGroups.split(", ").filter(Boolean)) {
        counts.set(path, (counts.get(path) ?? 0) + 1);
      }
    }
    return counts;
  }, [data]);

  const columns = useMemo(
    () => buildColumns(groups, groupCounts, adminGroupCounts, data.length),
    [groups, groupCounts, adminGroupCounts, data.length],
  );

  return (
    <>
      <Container>
        <div className="mb-6">
          <ButtonLink
            to={`invite?scope=${encodeURIComponent(scope)}`}
            theme="white"
          >
            <Icon icon="UserPlus" size={16} /> Invite User
          </ButtonLink>
        </div>
      </Container>
      {data.length > 0 ? (
        <div className="overflow-x-auto">
          <Table
            columns={columns}
            data={data}
            cellRenderers={cellRenderers}
            tableId={tableId}
          />
        </div>
      ) : (
        <Placeholder
          icon="Users"
          title="No users yet"
          description="Invite team members to get started."
          cta={
            <ButtonLink
              to={`invite?scope=${encodeURIComponent(scope)}`}
              scale="large"
              theme="primary"
            >
              Invite User
            </ButtonLink>
          }
        />
      )}
      <Outlet context={{ scope, users, groups }} />
    </>
  );
}
