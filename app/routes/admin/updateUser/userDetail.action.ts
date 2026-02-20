import { type ActionFunction, redirect } from "react-router";

import { authContext } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import {
  addUserToGroup,
  removeUserFromGroup,
  updateUser,
} from "~/.server/auth/keycloakAdmin";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { updateUserSchema } from "~/routes/admin/updateUser/updateUser.schema";

export const userDetailAction: ActionFunction = async ({
  request,
  context,
  params,
}) => {
  const { user, authTokens } = context.get(authContext);
  const scope = new URL(request.url).searchParams.get("scope");
  if (!scope) throw new Response("Missing scope", { status: 400 });
  const adminUrl = `/admin/users?scope=${encodeURIComponent(scope)}`;

  const isAdmin = user.adminScopes.some(
    (s) => scope === s || scope.startsWith(s + "/"),
  );
  if (!isAdmin) {
    throw new Response("Not authorized", { status: 403 });
  }

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
    await updateUser(authTokens.accessToken, params.userId!, result.data);

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
          ? addUserToGroup(authTokens.accessToken, params.userId!, groupId)
          : removeUserFromGroup(authTokens.accessToken, params.userId!, groupId),
      ),
    );

    session.set("notification", {
      status: "success",
      message: "User updated successfully.",
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
