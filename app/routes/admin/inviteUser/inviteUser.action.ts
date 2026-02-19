import {
  type ActionFunction,
  type LoaderFunction,
  redirect,
} from "react-router";

import { inviteUserSchema } from "./inviteUser.schema";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import {
  getGroupWithMembers,
  GroupWithMembers,
} from "~/.server/auth/keycloakAdmin/groups";
import { inviteUser } from "~/.server/auth/keycloakAdmin/users";
import { sessionStorage } from "~/.server/auth/sessionStorage";

export const middleware = [authMiddleware];

function flattenGroupPaths(group: GroupWithMembers): string[] {
  return [group.path, ...group.subGroups.flatMap(flattenGroupPaths)];
}

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

  return { scope, groupOptions: group ? flattenGroupPaths(group) : [scope] };
};

export const inviteUserAction: ActionFunction = async ({
  request,
  context,
  params,
}) => {
  const { user, authTokens } = context.get(authContext);
  const scope = [params.s0, params.s1, params.s2, params.s3].filter(Boolean).join("/");
  const adminUrl = `/admin/${scope}`;

  const isAdmin = user.adminScopes.some(
    (s) => scope === s || scope.startsWith(s + "/"),
  );
  if (!isAdmin) {
    throw new Response("Not authorized", { status: 403 });
  }

  const formData = await request.formData();
  const result = inviteUserSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors };
  }

  const isGroupPathAllowed = user.adminScopes.some(
    (s) =>
      result.data.groupPath === s || result.data.groupPath.startsWith(s + "/"),
  );
  if (!isGroupPathAllowed) {
    throw new Response("Not authorized", { status: 403 });
  }

  const session = await getSession(request);

  try {
    await inviteUser(
      authTokens.accessToken,
      result.data.email,
      result.data.firstName,
      result.data.lastName,
      result.data.groupPath,
    );
    session.set("notification", {
      status: "success",
      message: `Invited ${result.data.email} to ${result.data.groupPath}.`,
    });
  } catch (e) {
    console.error("Invite failed:", e);
    session.set("notification", {
      status: "error",
      message: "Failed to invite user.",
    });
  }

  return redirect(adminUrl, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};
