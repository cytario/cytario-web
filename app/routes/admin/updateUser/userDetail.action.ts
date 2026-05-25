import { type ActionFunction, redirect } from "react-router";

import { assertAdminScope } from "../assertAdminScope";
import { assertGroupsInScope } from "../assertGroupsInScope";
import { assertUsersInScope } from "../assertUsersInScope";
import { authContext } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import {
  addUserToOrganizationGroup,
  findOrganizationByAlias,
  removeUserFromOrganizationGroup,
  updateUser,
} from "~/.server/auth/keycloakAdmin";
import { KeycloakAdminError } from "~/.server/auth/keycloakAdmin/client";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { updateUserSchema } from "~/routes/admin/updateUser/updateUser.schema";

const ADD_PREFIX = "add-group-";
const REMOVE_PREFIX = "remove-group-";

function extractGroupIds(formData: FormData, prefix: string): string[] {
  const ids: string[] = [];
  for (const key of formData.keys()) {
    if (key.startsWith(prefix)) ids.push(key.slice(prefix.length));
  }
  return ids;
}

export const userDetailAction: ActionFunction = async ({ request, context, params }) => {
  const { user } = context.get(authContext);
  const { adminUrl, scope } = assertAdminScope(request.url, user.adminScopes);

  await assertUsersInScope([params.userId!], scope, user.organization);

  const formData = await request.formData();
  const rawData = Object.fromEntries(formData);

  const result = updateUserSchema.safeParse({
    ...rawData,
    enabled: rawData.enabled === "true",
  });

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors };
  }

  const session = await getSession(request);

  const adds = extractGroupIds(formData, ADD_PREFIX);
  const removes = extractGroupIds(formData, REMOVE_PREFIX);

  await assertGroupsInScope([...adds, ...removes], scope, user.organization);

  if (!user.organization) {
    throw new Response("No active organization", { status: 400 });
  }
  const org = await findOrganizationByAlias(user.organization);
  if (!org) {
    throw new KeycloakAdminError(404, `Organization not found: ${user.organization}`);
  }

  try {
    await updateUser(params.userId!, result.data);

    await Promise.all([
      ...adds.map((groupId) => addUserToOrganizationGroup(org.id, groupId, params.userId!)),
      ...removes.map((groupId) => removeUserFromOrganizationGroup(org.id, groupId, params.userId!)),
    ]);

    session.set("notification", {
      status: "success",
      message: `Updated ${result.data.firstName} ${result.data.lastName}.`,
    });
  } catch (e) {
    console.error("Update user failed:", e);
    session.set("notification", {
      status: "error",
      message: "Failed to update user.",
    });
  }

  return redirect(adminUrl, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};
