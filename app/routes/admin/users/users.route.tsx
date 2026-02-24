import { useMemo } from "react";
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

const columns: ColumnConfig[] = [
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
  },
];

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

  const [searchParams] = useSearchParams();
  const groupFilter = searchParams.get("group");

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

  const filteredData = groupFilter
    ? data.filter((row) => row._groupPaths.has(groupFilter))
    : data;

  return (
    <>
      <Container>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {groupFilter && (
              <>
                <span className="text-sm text-slate-600">
                  Filtered by group:
                </span>
                <span className="text-sm font-medium bg-slate-100 px-2 py-0.5 rounded">
                  {groupFilter}
                </span>
                <Link
                  to={`/admin/users?scope=${encodeURIComponent(scope)}`}
                  className="text-sm text-cytario-turquoise-700 hover:underline"
                >
                  Clear
                </Link>
              </>
            )}
          </div>
          <ButtonLink
            to={`invite?scope=${encodeURIComponent(scope)}`}
            theme="primary"
          >
            Invite User
          </ButtonLink>
        </div>
      </Container>
      {filteredData.length > 0 ? (
        <div className="overflow-x-auto">
          <Table
            columns={columns}
            data={filteredData}
            cellRenderers={cellRenderers}
            tableId={`admin-users-${scope}`}
          />
        </div>
      ) : (
        <Placeholder
          icon="Users"
          title="No users found"
          description={
            groupFilter
              ? "No users in this group."
              : "Invite team members to get started."
          }
          cta={
            !groupFilter ? (
              <ButtonLink
                to={`invite?scope=${encodeURIComponent(scope)}`}
                theme="primary"
              >
                Invite User
              </ButtonLink>
            ) : undefined
          }
        />
      )}
      <Outlet context={{ scope, users, groups }} />
    </>
  );
}
