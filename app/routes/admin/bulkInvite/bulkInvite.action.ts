import { type ActionFunction, redirect } from "react-router";

import { bulkInviteSchema } from "./bulkInvite.schema";
import { assertGrantScope } from "../assertAdminScope";
import { assertGroupsInScope } from "../assertGroupsInScope";
import { adminContext } from "~/.server/auth/adminMiddleware";
import { authContext } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import { toIdentity } from "~/.server/auth/getUserInfo";
import { findGroupPathInTree, inviteOrganizationUser } from "~/.server/auth/keycloakAdmin";
import { KeycloakAdminError } from "~/.server/auth/keycloakAdmin/client";
import { createPendingGroupAssignments } from "~/.server/auth/pendingGroupAssignments";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { consultUserMgmtGate } from "~/.server/userManagementGate";

export const bulkInviteAction: ActionFunction = async ({ request, context }) => {
  const { user, requestOrganization, entitlements } = context.get(authContext);
  const { org, adminUrl, scope } = context.get(adminContext);

  const json = await request.json();
  const result = bulkInviteSchema.safeParse(json);

  if (!result.success) {
    return { errors: result.error.flatten() };
  }

  const { rows, groupIds } = result.data;

  // The batch-level group ids are validated against the acting scope tree and
  // mapped to org-relative paths; each path must sit inside the acting admin's
  // subtree — the URL scope guard alone would accept a forged id outside it.
  let groupPaths: string[] = [];
  if (groupIds.length > 0) {
    const tree = await assertGroupsInScope(groupIds, scope, requestOrganization);
    groupPaths = groupIds
      .map((id) => findGroupPathInTree(tree, id))
      .filter((path): path is string => path !== undefined);
    if (groupPaths.length !== groupIds.length) {
      throw new Response("Not authorized", { status: 403 });
    }
    for (const path of groupPaths) {
      assertGrantScope(path, entitlements.adminScopes);
    }
  }

  await consultUserMgmtGate(toIdentity(user, requestOrganization), {
    kind: "invite",
    inviteCount: rows.length,
  });
  for (const path of groupPaths) {
    await consultUserMgmtGate(toIdentity(user, requestOrganization), {
      kind: "addToGroup",
      groupPath: path,
      addCount: rows.length,
    });
  }

  const results = await Promise.allSettled(
    rows.map((row) => inviteOrganizationUser(org.id, row.email)),
  );

  // A 409 ("already a member or pending invitation") is a benign no-op; the
  // pending assignment is still recorded for it, same as the single invite.
  const accepted = results
    .map((r, index) => ({
      email: rows[index].email,
      ok:
        r.status === "fulfilled" ||
        (r.status === "rejected" &&
          r.reason instanceof KeycloakAdminError &&
          r.reason.status === 409),
    }))
    .filter((r) => r.ok);

  if (groupPaths.length > 0 && accepted.length > 0) {
    await Promise.all(
      accepted.map((r) =>
        createPendingGroupAssignments(requestOrganization!, r.email, groupPaths, user.sub),
      ),
    );
  }

  const succeeded = accepted.length;
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
