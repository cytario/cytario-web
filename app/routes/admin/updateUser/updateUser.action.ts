import { ActionFunction, redirect } from "react-router";

import { authContext } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import { updateUser } from "~/.server/auth/keycloakAdmin";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { updateUserSchema } from "~/routes/admin/updateUser/updateUser.schema";

/**
 * Handles user update form submission. Validates input and updates user in Keycloak.
 */
export const updateUserAction: ActionFunction = async ({
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
