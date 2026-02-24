import { type MetaFunction, Link, useLoaderData } from "react-router";

import { authMiddleware } from "~/.server/auth/authMiddleware";
import { type GroupWithMembers } from "~/.server/auth/keycloakAdmin";
import { Container } from "~/components/Container";
import { Placeholder } from "~/components/Placeholder";

export const meta: MetaFunction = () => [{ title: "Admin — Groups" }];

export const middleware = [authMiddleware];

export { groupsLoader as loader } from "./groups.loader";

function GroupTree({
  group,
  scope,
  depth,
}: {
  group: GroupWithMembers;
  scope: string;
  depth: number;
}) {
  if (group.name === "admins") return null;

  return (
    <div>
      <div
        className="flex items-center justify-between py-2 border-b border-slate-200"
        style={{ paddingLeft: `${depth * 1.5}rem` }}
      >
        <Link
          to={`/admin/users?scope=${encodeURIComponent(scope)}&group=${encodeURIComponent(group.path)}`}
          className="text-cytario-turquoise-700 hover:underline font-medium"
        >
          {group.name}
        </Link>
        <span className="text-sm text-slate-500">
          {group.members.length}{" "}
          {group.members.length === 1 ? "member" : "members"}
        </span>
      </div>
      {group.subGroups.map((sub) => (
        <GroupTree key={sub.id} group={sub} scope={scope} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function AdminGroupsRoute() {
  const { scope, group } = useLoaderData<{
    scope: string;
    group: GroupWithMembers | null;
  }>();

  return (
    <Container>
      {group ? (
        <GroupTree group={group} scope={scope} depth={0} />
      ) : (
        <Placeholder
          icon="FolderTree"
          title="No groups"
          description="No group structure found for this scope."
        />
      )}
    </Container>
  );
}
