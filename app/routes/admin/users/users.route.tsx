import { useState, useMemo, useCallback } from "react";
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
import { ButtonLink, Switch } from "~/components/Controls";
import { H1 } from "~/components/Fonts";
import { Placeholder } from "~/components/Placeholder";
import { type ColumnConfig, Table } from "~/components/Table/Table";

export const meta: MetaFunction = () => [{ title: "Admin" }];

export const middleware = [authMiddleware];

export { usersLoader as loader } from "./users.loader";
export { usersAction as action } from "./users.action";

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

  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());

  const handleToggleMembership = useCallback(
    async (userId: string, groupId: string, isMember: boolean) => {
      const toggleKey = `${userId}-${groupId}`;
      setPendingToggles((prev) => new Set(prev).add(toggleKey));

      try {
        const formData = new FormData();
        formData.append("action", "toggleGroupMembership");
        formData.append("userId", userId);
        formData.append("groupId", groupId);
        formData.append("isMember", String(isMember));

        const response = await fetch(
          `${window.location.pathname}${window.location.search}`,
          { method: "POST", body: formData },
        );

        if (!response.ok) throw new Error("Toggle failed");

        window.location.reload();
      } catch (error) {
        console.error("Toggle membership failed:", error);
      } finally {
        setPendingToggles((prev) => {
          const next = new Set(prev);
          next.delete(toggleKey);
          return next;
        });
      }
    },
    [],
  );

  const handleToggleEnabled = useCallback(
    async (userId: string, enabled: boolean) => {
      const toggleKey = `enabled-${userId}`;
      setPendingToggles((prev) => new Set(prev).add(toggleKey));

      try {
        const formData = new FormData();
        formData.append("action", "toggleUserEnabled");
        formData.append("userId", userId);
        formData.append("enabled", String(enabled));

        const response = await fetch(
          `${window.location.pathname}${window.location.search}`,
          { method: "POST", body: formData },
        );

        if (!response.ok) throw new Error("Toggle failed");

        window.location.reload();
      } catch (error) {
        console.error("Toggle enabled failed:", error);
      } finally {
        setPendingToggles((prev) => {
          const next = new Set(prev);
          next.delete(toggleKey);
          return next;
        });
      }
    },
    [],
  );

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
      <Switch
        key={`status-${user.id}`}
        checked={user.enabled}
        onChange={() => handleToggleEnabled(user.id, user.enabled)}
        disabled={pendingToggles.has(`enabled-${user.id}`)}
      />,
      ...groups.map((group) => {
        const isMember = groupPaths.has(group.path);
        const toggleKey = `${user.id}-${group.id}`;

        return (
          <Switch
            key={toggleKey}
            checked={isMember}
            onChange={() => handleToggleMembership(user.id, group.id, isMember)}
            disabled={pendingToggles.has(toggleKey)}
          />
        );
      }),
    ]);
  }, [
    users,
    groups,
    scope,
    pendingToggles,
    handleToggleMembership,
    handleToggleEnabled,
  ]);

  console.log(scope, users, groups);

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
