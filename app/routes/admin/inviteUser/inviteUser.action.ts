import { type ActionFunction, redirect } from "react-router";

import { inviteUserSchema } from "./inviteUser.schema";
import { assertAdminScope } from "../assertAdminScope";
import { assertGroupPathsInScope } from "../assertGroupPathsInScope";
import { authContext } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import { inviteUser } from "~/.server/auth/keycloakAdmin/users";
import { sessionStorage } from "~/.server/auth/sessionStorage";

export const inviteUserAction: ActionFunction = async ({
  request,
  context,
}) => {
  const { user } = context.get(authContext);
  const { adminUrl, scope } = assertAdminScope(request.url, user.adminScopes);

  const formData = await request.formData();
  const inviteAnother = formData.get("inviteAnother") === "true";
  const rawData = Object.fromEntries(formData);
  const result = inviteUserSchema.safeParse({
    ...rawData,
    enabled: rawData.enabled === "true",
  });

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors };
  }

  await assertGroupPathsInScope([result.data.groupPath], scope);

  const session = await getSession(request);

  try {
    await inviteUser(
      result.data.email,
      result.data.firstName,
      result.data.lastName,
      result.data.groupPath,
      result.data.enabled,
    );

    if (inviteAnother) {
      return {
        success: true,
        message: `Invited ${result.data.email} to ${result.data.groupPath}.`,
      };
    }

    session.set("notification", {
      status: "success",
      message: `Invited ${result.data.email} to ${result.data.groupPath}.`,
    });
  } catch (e) {
    console.error("Invite failed:", e);

    const status = e instanceof Response ? e.status : undefined;
    const message =
      status === 409
        ? `A user with email ${result.data.email} already exists.`
        : status === 404
          ? `Group ${result.data.groupPath} was not found.`
          : "Failed to invite user. Please try again.";

    if (inviteAnother) {
      return { success: false, message };
    }

    session.set("notification", {
      status: "error",
      message,
    });
  }

  return redirect(adminUrl, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};
