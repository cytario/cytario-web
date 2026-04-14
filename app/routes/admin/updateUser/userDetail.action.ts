import { type ActionFunction, redirect } from "react-router";

import { assertAdminScope } from "../assertAdminScope";
import { authContext } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import {
  addUserToGroup,
  removeUserFromGroup,
  updateUser,
} from "~/.server/auth/keycloakAdmin";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { assertUsersInScope } from "~/routes/admin/assertUsersInScope";
import { updateUserSchema } from "~/routes/admin/updateUser/updateUser.schema";

export const userDetailAction: ActionFunction = async ({
  request,
  context,
  params,
}) => {
  const { user } = context.get(authContext);
  const { adminUrl, scope } = assertAdminScope(request.url, user.adminScopes);

  await assertUsersInScope([params.userId!], scope);

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

  try {
    await updateUser(params.userId!, result.data);

    // Process group membership changes
    const groupEntries = [...formData.entries()]
      .filter(([key]) => key.startsWith("group-"))
      .map(([key, value]) => ({
        groupId: key.replace("group-", ""),
        shouldBeMember: value === "true",
      }));

    await Promise.all(
      groupEntries.map(({ groupId, shouldBeMember }) =>
        shouldBeMember
          ? addUserToGroup(params.userId!, groupId)
          : removeUserFromGroup(params.userId!, groupId),
      ),
    );

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
