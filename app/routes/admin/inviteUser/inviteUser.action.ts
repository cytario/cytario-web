import { type ActionFunction, redirect } from "react-router";

import { inviteUserSchema } from "./inviteUser.schema";
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

export const inviteUserAction: ActionFunction = async ({ request, context }) => {
  const { user, requestOrganization, entitlements } = context.get(authContext);
  const { org, adminUrl, scope } = context.get(adminContext);

  const formData = await request.formData();
  const inviteAnother = formData.get("inviteAnother") === "true";
  // The multi-select submits one comma-joined groupIds field; a client sending
  // several entries has its extras read here rather than silently dropped.
  const rawData = {
    email: formData.get("email"),
    groupIds: formData.getAll("groupIds"),
  };
  const result = inviteUserSchema.safeParse(rawData);

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors };
  }

  const { email, groupIds } = result.data;

  // The multi-select submits group ids; map each validated id back to its
  // org-relative path, then assert the acting admin's scope covers it — the
  // URL scope guard alone would let a forged field name a group outside the
  // admin's subtree.
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

  const session = await getSession(request);

  try {
    await consultUserMgmtGate(toIdentity(user, requestOrganization), {
      kind: "invite",
      inviteCount: 1,
    });
    for (const path of groupPaths) {
      await consultUserMgmtGate(toIdentity(user, requestOrganization), {
        kind: "addToGroup",
        groupPath: path,
        addCount: 1,
      });
    }

    // Keycloak returns 409 both for "pending invitation already exists" and
    // "user is already a member" — indistinguishable, and both leave an
    // invitee who should claim the groups, so the assignment is recorded for
    // either outcome. A real error throws and records nothing.
    let inviteLanded = false;
    try {
      await inviteOrganizationUser(org.id, email);
      inviteLanded = true;
    } catch (e) {
      if (!(e instanceof KeycloakAdminError) || e.status !== 409) throw e;
      inviteLanded = true;
    }
    if (inviteLanded && groupPaths.length > 0) {
      await createPendingGroupAssignments(requestOrganization!, email, groupPaths, user.sub);
    }

    const message = `Invited ${email} to ${requestOrganization}.`;
    if (inviteAnother) {
      return { success: true, message };
    }
    session.set("notification", { status: "success", message });
  } catch (e) {
    if (e instanceof Response) throw e;
    const status = e instanceof KeycloakAdminError ? e.status : undefined;
    if (status === 409) {
      const message = `${email} already has a pending invitation or is a member.`;
      if (inviteAnother) {
        return { success: true, message };
      }
      session.set("notification", { status: "warning", message });
    } else {
      console.error("Invite failed:", e);
      const message = "Failed to invite user. Please try again.";
      if (inviteAnother) {
        return { success: false, message };
      }
      session.set("notification", { status: "error", message });
    }
  }

  return redirect(adminUrl, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};
