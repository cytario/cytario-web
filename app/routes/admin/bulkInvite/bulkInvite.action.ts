import { type ActionFunction, redirect } from "react-router";

import { bulkInviteSchema } from "./bulkInvite.schema";
import { assertAdminScope } from "../assertAdminScope";
import { authContext } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import { findOrganizationByAlias, inviteOrganizationUser } from "~/.server/auth/keycloakAdmin";
import { KeycloakAdminError } from "~/.server/auth/keycloakAdmin/client";
import { sessionStorage } from "~/.server/auth/sessionStorage";

export const bulkInviteAction: ActionFunction = async ({ request, context }) => {
  const { user } = context.get(authContext);
  const { adminUrl } = assertAdminScope(request.url, user.adminScopes);

  if (!user.organization) {
    throw new Response("No active organization", { status: 400 });
  }

  const json = await request.json();
  const result = bulkInviteSchema.safeParse(json);

  if (!result.success) {
    return { errors: result.error.flatten() };
  }

  const { rows } = result.data;

  const org = await findOrganizationByAlias(user.organization);
  if (!org) {
    throw new KeycloakAdminError(404, `Organization not found: ${user.organization}`);
  }

  const results = await Promise.allSettled(
    rows.map((row) =>
      inviteOrganizationUser(
        org.id,
        row.email,
        row.firstName || undefined,
        row.lastName || undefined,
      ),
    ),
  );

  // Treat 409 ("already a member or pending invitation") as a benign no-op,
  // not a failure — same rationale as the single-invite action.
  const succeeded = results.filter(
    (r) =>
      r.status === "fulfilled" ||
      (r.status === "rejected" &&
        r.reason instanceof KeycloakAdminError &&
        r.reason.status === 409),
  ).length;
  const failed = rows.length - succeeded;

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
