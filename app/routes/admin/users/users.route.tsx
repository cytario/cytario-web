import { useMemo } from "react";
import {
  type MetaFunction,
  type ShouldRevalidateFunction,
  Link,
  Outlet,
  useLoaderData,
} from "react-router";

import { authMiddleware } from "~/.server/auth/authMiddleware";
import {
  type UserWithGroups,
  type GroupInfo,
} from "~/.server/auth/keycloakAdmin";
import { Container, Section } from "~/components/Container";
import { ButtonLink, Checkbox } from "~/components/Controls";
import { H1 } from "~/components/Fonts";
import { Placeholder } from "~/components/Placeholder";
import { type ColumnConfig, Table } from "~/components/Table/Table";

export const meta: MetaFunction = () => [{ title: "Admin" }];

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

function buildMatrixColumns(groups: GroupInfo[]): ColumnConfig[] {
  return [
    {
      id: "name",
      header: "Name",
      size: 200,
      enableSorting: true,
    },
    {
      id: "email",
      header: "Email",
      size: 250,
      enableSorting: true,
    },
    {
      id: "status",
      header: "Status",
      size: 120,
      enableResizing: true,
    },
    ...groups.map((g) => ({
      id: `group-${g.id}`,
      header: g.path,
      size: 120,
      enableResizing: true,
    })),
  ];
}

export default function AdminUsersRoute() {
  const { scope, users, groups } = useLoaderData<{
    scope: string;
    users: UserWithGroups[];
    groups: GroupInfo[];
  }>();

  const columns = useMemo(() => buildMatrixColumns(groups), [groups]);

  const data = useMemo(() => {
    return users.map(({ user, groupPaths }) => [
      <Link
        key={`name-${user.id}`}
        to={`${user.id}?scope=${encodeURIComponent(scope)}`}
        className="text-cytario-turquoise-700 hover:underline"
      >
        {user.firstName} {user.lastName}
      </Link>,
      user.email,
      <Checkbox key={`status-${user.id}`} checked={user.enabled} disabled />,
      ...groups.map((group) => (
        <Checkbox
          key={`${user.id}-${group.id}`}
          checked={groupPaths.has(group.path)}
          disabled
        />
      )),
    ]);
  }, [users, groups, scope]);

  return (
    <Section>
      <Container>
        <div className="flex items-center justify-between mb-6">
          <H1 className="font-bold text-2xl">{scope}</H1>
          <ButtonLink
            to={`invite?scope=${encodeURIComponent(scope)}`}
            theme="primary"
          >
            Invite User
          </ButtonLink>
        </div>
      </Container>
      {users.length > 0 ? (
        <div className="overflow-x-auto">
          <Table
            columns={columns}
            data={data}
            tableId={`admin-matrix-${scope}`}
          />
        </div>
      ) : (
        <Placeholder
          title="No users"
          description="There are no users in this scope"
        />
      )}
      <Outlet context={{ scope, users, groups }} />
    </Section>
  );
}
