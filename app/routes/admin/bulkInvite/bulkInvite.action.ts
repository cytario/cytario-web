import { type ActionFunction, redirect } from "react-router";

import { bulkInviteSchema } from "./bulkInvite.schema";
import { assertAdminScope } from "../assertAdminScope";
import { authContext } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import { inviteUser } from "~/.server/auth/keycloakAdmin/users";
import { sessionStorage } from "~/.server/auth/sessionStorage";

export const bulkInviteAction: ActionFunction = async ({
  request,
  context,
}) => {
  const { user } = context.get(authContext);
  const { adminUrl } = assertAdminScope(request.url, user.adminScopes);

  const json = await request.json();
  const result = bulkInviteSchema.safeParse(json);

  if (!result.success) {
    return { errors: result.error.flatten() };
  }

  const { groupPath, enabled, rows } = result.data;

  const isGroupPathAllowed = user.adminScopes.some(
    (s) => groupPath === s || groupPath.startsWith(s + "/"),
  );
  if (!isGroupPathAllowed) {
    throw new Response("Not authorized", { status: 403 });
  }

  const results = await Promise.allSettled(
    rows.map((row) =>
      inviteUser(
        row.email,
        row.firstName,
        row.lastName,
        groupPath,
        enabled,
      ),
    ),
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  const session = await getSession(request);

  let message: string;
  let status: "success" | "error" | "warning";

  if (failed === 0) {
    message = `Invited ${succeeded} user${succeeded !== 1 ? "s" : ""}.`;
    status = "success";
  } else if (succeeded === 0) {
    message = `Failed to invite ${failed} user${failed !== 1 ? "s" : ""}.`;
    status = "error";
  } else {
    message = `Invited ${succeeded} of ${rows.length} users. ${failed} failed.`;
    status = "warning";
  }

  session.set("notification", { status, message });

  return redirect(adminUrl, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};
