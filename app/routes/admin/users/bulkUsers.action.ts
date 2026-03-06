import { type ActionFunction, redirect } from "react-router";

import { bulkActionSchema } from "./bulkUsers.schema";
import { assertAdminScope } from "../assertAdminScope";
import { authContext } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import {
  addUserToGroup,
  removeUserFromGroup,
  setUserEnabled,
} from "~/.server/auth/keycloakAdmin";
import { sessionStorage } from "~/.server/auth/sessionStorage";

const actionLabels = {
  addToGroup: "added to group",
  removeFromGroup: "removed from group",
  enableAccounts: "enabled",
  disableAccounts: "disabled",
} as const;

export const bulkUsersAction: ActionFunction = async ({
  request,
  context,
}) => {
  const { user, authTokens } = context.get(authContext);
  const { adminUrl } = assertAdminScope(request.url, user.adminScopes);

  const formData = await request.formData();
  const rawData = Object.fromEntries(formData);
  const result = bulkActionSchema.safeParse(rawData);

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors };
  }

  const { intent, userIds, groupId } = result.data;
  const session = await getSession(request);
  const token = authTokens.accessToken;

  const operations = userIds.map((userId) => {
    switch (intent) {
      case "addToGroup":
        return addUserToGroup(token, userId, groupId!);
      case "removeFromGroup":
        return removeUserFromGroup(token, userId, groupId!);
      case "enableAccounts":
        return setUserEnabled(token, userId, true);
      case "disableAccounts":
        return setUserEnabled(token, userId, false);
    }
  });

  const results = await Promise.allSettled(operations);
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  let message: string;
  let status: "success" | "error" | "warning";

  if (failed === 0) {
    message = `${succeeded} user${succeeded !== 1 ? "s" : ""} ${actionLabels[intent]}.`;
    status = "success";
  } else if (succeeded === 0) {
    message = `Failed to update ${failed} user${failed !== 1 ? "s" : ""}.`;
    status = "error";
  } else {
    message = `${succeeded} of ${userIds.length} user${userIds.length !== 1 ? "s" : ""} ${actionLabels[intent]}. ${failed} failed.`;
    status = "warning";
  }

  session.set("notification", { status, message });

  return redirect(adminUrl, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};
