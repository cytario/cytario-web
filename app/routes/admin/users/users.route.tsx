import { useMemo } from "react";
import {
  type MetaFunction,
  type ShouldRevalidateFunction,
  Link,
  Outlet,
  useLoaderData,
} from "react-router";

import type { GroupTreeNode } from "./users.loader";
import { authMiddleware } from "~/.server/auth/authMiddleware";
import {
  type UserWithGroups,
  type GroupInfo,
} from "~/.server/auth/keycloakAdmin";
import { Container } from "~/components/Container";
import { ButtonLink, type TreeNode } from "~/components/Controls";
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
  enabled: boolean;
  groups: string;
  _scope: string;
  [key: string]: unknown;
}

function toFilterTree(node: GroupTreeNode): TreeNode | null {
  if (node.name === "admins") return null;
  return {
    id: node.id,
    label: node.name,
    value: node.path,
    count: node.memberCount,
    children: node.subGroups
      .map(toFilterTree)
      .filter((n): n is TreeNode => n !== null),
  };
}

function buildColumns(filterTree: TreeNode | null): ColumnConfig[] {
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
      size: 120,
      enableSorting: true,
      sortingFn: "boolean" as const,
      enableColumnFilter: true,
      filterType: "select",
      filterOptions: [
        { label: "Active", value: "true" },
        { label: "Disabled", value: "false" },
      ],
    },
    {
      id: "groups",
      header: "Groups",
      size: 300,
      enableSorting: true,
      enableColumnFilter: true,
      filterType: "select",
      filterTree: filterTree ?? undefined,
    },
  ];
}

const groupColors = [
  "bg-sky-100 text-sky-800",
  "bg-amber-100 text-amber-800",
  "bg-emerald-100 text-emerald-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-orange-100 text-orange-800",
  "bg-teal-100 text-teal-800",
  "bg-fuchsia-100 text-fuchsia-800",
];

function groupColorClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return groupColors[Math.abs(hash) % groupColors.length];
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
        row.enabled
          ? "bg-green-100 text-green-700"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      {row.enabled ? "Active" : "Disabled"}
    </span>
  ),
  groups: (row) => (
    <div className="flex flex-wrap gap-1">
      {row.groups
        .split(", ")
        .filter(Boolean)
        .map((path) => {
          const segments = path.split("/");
          const leaf = segments.at(-1);
          const depth = segments.length - 1;
          return (
            <div
              key={path}
              className={`
              px-1 py-0.5 text-xs font-medium rounded-full
              flex gap-1 
              bg-white 
              border text-slate-900
              
              `}
            >
              {Array.from({ length: depth }, (_, i) => (
                <div key={i} className="w-4 h-4 rounded-full border" />
              ))}
              <span className={`px-1 rounded-full ${groupColorClass(leaf ?? "")}`}>{leaf}</span>
            </div>
          );
        })}
    </div>
  ),
};

export default function AdminUsersRoute() {
  const { scope, users, groups, groupTree } = useLoaderData<{
    scope: string;
    users: UserWithGroups[];
    groups: GroupInfo[];
    groupTree: GroupTreeNode | null;
  }>();

  const filterTree = useMemo(
    () => (groupTree ? toFilterTree(groupTree) : null),
    [groupTree],
  );
  const columns = useMemo(() => buildColumns(filterTree), [filterTree]);

  const tableId = `admin-users-${scope}`;

  const data: UserRow[] = useMemo(
    () =>
      users.map(({ user, groupPaths }) => ({
        name: `${user.firstName} ${user.lastName}`,
        userId: user.id,
        email: user.email ?? "",
        enabled: user.enabled,
        groups: [...groupPaths]
          .filter((p) => !p.endsWith("/admins"))
          .join(", "),
        _scope: scope,
      })),
    [users, scope],
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
