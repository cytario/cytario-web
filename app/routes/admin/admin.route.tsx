import { type ReactNode } from "react";
import {
  type LoaderFunction,
  type MetaFunction,
  Link,
  Outlet,
  useLoaderData,
} from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import {
  getGroupWithMembers,
  type GroupWithMembers,
  type KeycloakUser,
} from "~/.server/auth/keycloakAdmin";
import { Section } from "~/components/Container";
import { ButtonLink } from "~/components/Controls";
import { type ColumnConfig, Table } from "~/components/Table/Table";

const title = "Admin";

export const meta: MetaFunction = () => {
  return [{ title }];
};

export const middleware = [authMiddleware];

export const loader: LoaderFunction = async ({ context, params }) => {
  const { user, authTokens } = context.get(authContext);
  const scope = params.group ? `${params.org}/${params.group}` : params.org!;

  const isAdmin = user.adminScopes.some(
    (s) => scope === s || scope.startsWith(s + "/"),
  );

  if (!isAdmin) {
    throw new Response("Not authorized", { status: 403 });
  }

  const group = await getGroupWithMembers(authTokens.accessToken, scope);

  return { scope, group };
};

const memberColumns: ColumnConfig[] = [
  { id: "name", header: "Name", size: 200, enableSorting: true },
  { id: "email", header: "Email", size: 250, enableSorting: true },
  {
    id: "status",
    header: "Status",
    size: 100,
    enableResizing: false,
  },
];

function memberToRow(member: KeycloakUser): ReactNode[] {
  return [
    <Link key="name" to={`user/${member.id}`} className="hover:underline">
      {member.firstName} {member.lastName}
    </Link>,
    member.email,
    member.enabled ? (
      "Active"
    ) : (
      <span className="text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
        Disabled
      </span>
    ),
  ];
}

function GroupSection({
  group,
  depth = 0,
}: {
  group: GroupWithMembers;
  depth?: number;
}) {
  return (
    <div className={depth > 0 ? "ml-6 mt-4" : ""}>
      <h2 className="font-bold text-lg">{group.path}</h2>

      {group.members.length > 0 ? (
        <Table
          columns={memberColumns}
          data={group.members.map(memberToRow)}
          tableId={`admin-members-${group.path}`}
        />
      ) : (
        <p className="text-sm text-slate-400 mt-1">No direct members</p>
      )}

      {group.subGroups.map((sg) => (
        <GroupSection key={sg.path} group={sg} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function AdminRoute() {
  const { scope, group } = useLoaderData<{
    scope: string;
    group?: GroupWithMembers;
  }>();

  return (
    <Section>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-bold text-2xl">{scope}</h1>
          <ButtonLink to="invite" theme="primary">
            Invite User
          </ButtonLink>
        </div>
        {group ? (
          <GroupSection group={group} />
        ) : (
          <p className="text-slate-500">Group not found.</p>
        )}
      </div>
      <Outlet />
    </Section>
  );
}
