import { useState, useMemo, useCallback } from "react";
import {
  type ActionFunction,
  type LoaderFunction,
  type MetaFunction,
  Link,
  Outlet,
  useLoaderData,
} from "react-router";
import { z } from "zod";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import {
  adminFetch,
  getGroupWithMembers,
  flattenGroupsWithIds,
  collectAllUsers,
  addUserToGroup,
  removeUserFromGroup,
  updateUser,
  type KeycloakUser,
  type UserWithGroups,
  type GroupInfo,
} from "~/.server/auth/keycloakAdmin";
import { Container, Section } from "~/components/Container";
import { ButtonLink, Switch } from "~/components/Controls";
import { H1 } from "~/components/Fonts";
import { Placeholder } from "~/components/Placeholder";
import { type ColumnConfig, Table } from "~/components/Table/Table";

const title = "Admin";

export const meta: MetaFunction = () => [{ title }];

export const middleware = [authMiddleware];

export const loader: LoaderFunction = async ({ context, params }) => {
  const { user, authTokens } = context.get(authContext);
  const scope = [params.s0, params.s1, params.s2, params.s3].filter(Boolean).join("/");

  const isAdmin = user.adminScopes.some(
    (s) => scope === s || scope.startsWith(s + "/"),
  );

  if (!isAdmin) {
    throw new Response("Not authorized", { status: 403 });
  }

  const group = await getGroupWithMembers(authTokens.accessToken, scope);

  if (!group) {
    return { scope, users: [], groups: [] };
  }

  const users = collectAllUsers(group);
  const groups = flattenGroupsWithIds(group);

  return { scope, users, groups };
};

const toggleGroupMembershipSchema = z.object({
  action: z.literal("toggleGroupMembership"),
  userId: z.string(),
  groupId: z.string(),
  isMember: z.enum(["true", "false"]),
});

const toggleUserEnabledSchema = z.object({
  action: z.literal("toggleUserEnabled"),
  userId: z.string(),
  enabled: z.enum(["true", "false"]),
});

export const action: ActionFunction = async ({ request, context, params }) => {
  const { user, authTokens } = context.get(authContext);
  const scope = [params.s0, params.s1, params.s2, params.s3].filter(Boolean).join("/");

  const isAdmin = user.adminScopes.some(
    (s) => scope === s || scope.startsWith(s + "/"),
  );

  if (!isAdmin) {
    return { error: "Unauthorized" };
  }

  const formData = await request.formData();
  const data = Object.fromEntries(formData);

  try {
    if (data.action === "toggleGroupMembership") {
      const { userId, groupId, isMember } =
        toggleGroupMembershipSchema.parse(data);

      if (isMember === "true") {
        await removeUserFromGroup(authTokens.accessToken, userId, groupId);
      } else {
        await addUserToGroup(authTokens.accessToken, userId, groupId);
      }

      return { success: true };
    }

    if (data.action === "toggleUserEnabled") {
      const { userId, enabled } = toggleUserEnabledSchema.parse(data);

      const userToUpdate = await adminFetch<KeycloakUser>(
        authTokens.accessToken,
        `/users/${userId}`,
      );

      await updateUser(authTokens.accessToken, userId, {
        ...userToUpdate,
        enabled: enabled !== "true",
      });

      return { success: true };
    }

    return { error: "Invalid action" };
  } catch (error) {
    console.error("Action failed:", error);
    return { error: "Operation failed" };
  }
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

export default function AdminRoute() {
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

        const response = await fetch(window.location.pathname, {
          method: "POST",
          body: formData,
        });

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

        const response = await fetch(window.location.pathname, {
          method: "POST",
          body: formData,
        });

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
        to={`user/${user.id}`}
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
    pendingToggles,
    handleToggleMembership,
    handleToggleEnabled,
  ]);

  return (
    <Section>
      <Container>
        <div className="flex items-center justify-between mb-6">
          <H1 className="font-bold text-2xl">{scope}</H1>
          <ButtonLink to="invite" theme="primary">
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

      <Outlet />
    </Section>
  );
}
