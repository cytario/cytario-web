import { useEffect, useMemo } from "react";
import {
  type MetaFunction,
  type ShouldRevalidateFunction,
  Link,
  Outlet,
  useLoaderData,
  useSearchParams,
} from "react-router";

import { authMiddleware } from "~/.server/auth/authMiddleware";
import {
  type UserWithGroups,
  type GroupInfo,
} from "~/.server/auth/keycloakAdmin";
import { Container } from "~/components/Container";
import { ButtonLink, Checkbox } from "~/components/Controls";
import { Placeholder } from "~/components/Placeholder";
import { useTableStore } from "~/components/Table/state/useTableStore";
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
  email: string;
  enabled: boolean;
  groups: string;
  _userId: string;
  _scope: string;
  _groupPaths: Set<string>;
  [key: string]: unknown;
}

function buildColumns(groups: GroupInfo[]): ColumnConfig[] {
  const groupOptions = groups
    .filter((g) => !g.isAdmin)
    .map((g) => ({ label: g.path, value: g.path }));

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
      id: "email",
      header: "Email",
      size: 250,
      enableSorting: true,
      enableColumnFilter: true,
      filterType: "text",
    },
    {
      id: "enabled",
      header: "Enabled",
      size: 100,
      enableSorting: true,
      sortingFn: "boolean" as const,
    },
    {
      id: "groups",
      header: "Groups",
      size: 300,
      enableSorting: true,
      enableColumnFilter: true,
      filterType: "select",
      filterOptions: groupOptions,
    },
  ];
}

const cellRenderers: CellRenderers<UserRow> = {
  name: (row) => (
    <Link
      to={`${row._userId}?scope=${encodeURIComponent(row._scope)}`}
      className="text-cytario-turquoise-700 hover:underline"
    >
      {row.name}
    </Link>
  ),
  enabled: (row) => <Checkbox checked={row.enabled} disabled />,
};

export default function AdminUsersRoute() {
  const { scope, users, groups } = useLoaderData<{
    scope: string;
    users: UserWithGroups[];
    groups: GroupInfo[];
  }>();

  const columns = useMemo(() => buildColumns(groups), [groups]);

  const [searchParams] = useSearchParams();
  const groupFilter = searchParams.get("group");
  const tableId = `admin-users-${scope}`;
  const store = useTableStore(tableId);

  useEffect(() => {
    if (groupFilter) {
      store.getState().setColumnFilters([{ id: "groups", value: groupFilter }]);
    } else {
      const current = store.getState().columnFilters;
      const withoutGroup = current.filter((f) => f.id !== "groups");
      if (withoutGroup.length !== current.length) {
        store.getState().setColumnFilters(withoutGroup);
      }
    }
  }, [groupFilter, store]);

  const data: UserRow[] = useMemo(
    () =>
      users.map(({ user, groupPaths }) => ({
        name: `${user.firstName} ${user.lastName}`,
        email: user.email ?? "",
        enabled: user.enabled,
        groups: [...groupPaths]
          .filter((p) => !p.endsWith("/admins"))
          .join(", "),
        _userId: user.id,
        _scope: scope,
        _groupPaths: groupPaths,
      })),
    [users, scope],
  );

  return (
    <>
      <Container>
        <div className="flex items-center justify-end mb-4">
          <ButtonLink
            to={`invite?scope=${encodeURIComponent(scope)}`}
            theme="primary"
          >
            Invite User
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
