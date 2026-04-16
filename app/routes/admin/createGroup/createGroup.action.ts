import { type ActionFunction, redirect } from "react-router";

import { createGroupSchema } from "./createGroup.schema";
import { assertAdminScope } from "../assertAdminScope";
import { authContext } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import { addUserToGroup, createGroup } from "~/.server/auth/keycloakAdmin";
import { KeycloakAdminError } from "~/.server/auth/keycloakAdmin/client";
import { sessionStorage } from "~/.server/auth/sessionStorage";

export const createGroupAction: ActionFunction = async ({
  request,
  context,
}) => {
  const { user } = context.get(authContext);
  const { adminUrl, scope } = assertAdminScope(request.url, user.adminScopes);

  const formData = await request.formData();
  const result = createGroupSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors };
  }

  const session = await getSession(request);

  try {
    const { path, adminsGroupId } = await createGroup(
      scope,
      result.data.name,
    );

    await addUserToGroup(user.sub, adminsGroupId);

    const newScopeUrl = `/admin/users?scope=${encodeURIComponent(path)}`;

    session.set("notification", {
      status: "success",
      message: `Created group "${result.data.name}" under ${scope}.`,
    });

    return redirect(newScopeUrl, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  } catch (e) {
    console.error("Create group failed:", e);

    const status =
      e instanceof KeycloakAdminError ? e.status : undefined;
    const message =
      status === 409
        ? `A group named "${result.data.name}" already exists under ${scope}.`
        : "Failed to create group. Please try again.";

    session.set("notification", {
      status: "error",
      message,
    });
  }

  return redirect(adminUrl, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};
