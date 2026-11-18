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

interface InviteOutcome {
  email: string;
  alreadyInvited: boolean;
  failed: boolean;
}

interface InviteSummary {
  message: string;
  status: "success" | "warning" | "error";
}

/**
 * One summary for any batch size: how many were invited, failed, or already
 * had a pending invitation or membership (a 409 counts as accepted, as it did
 * in the former bulk flow).
 */
function summarize(outcomes: InviteOutcome[], organization: string): InviteSummary {
  const total = outcomes.length;
  const failed = outcomes.filter((outcome) => outcome.failed).length;
  const already = outcomes.filter((outcome) => outcome.alreadyInvited).length;
  const invited = total - failed - already;
  const plural = total === 1 ? "" : "s";

  if (failed === total) {
    return {
      message: `Failed to invite ${total} user${plural}. Please try again.`,
      status: "error",
    };
  }

  const parts: string[] = [];
  if (invited > 0) {
    parts.push(`Invited ${invited} of ${total} user${plural} to ${organization}.`);
  }
  if (already > 0) {
    parts.push(
      `${already} already had a pending invitation or ${already === 1 ? "was" : "were"} a member.`,
    );
  }
  if (failed > 0) {
    parts.push(`${failed} failed.`);
  }
  return {
    message: parts.join(" "),
    status: failed > 0 || already > 0 ? "warning" : "success",
  };
}

export const inviteUserAction: ActionFunction = async ({ request, context }) => {
  const { user, requestOrganization, entitlements } = context.get(authContext);
  const { org, adminUrl, scope } = context.get(adminContext);

  const formData = await request.formData();
  const rawData = {
    emails: formData.getAll("emails"),
    groupIds: formData.getAll("groupIds"),
  };
  const result = inviteUserSchema.safeParse(rawData);

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors };
  }

  const { emails, groupIds } = result.data;

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
  const identity = toIdentity(user, requestOrganization);

  let summary: InviteSummary;

  try {
    await consultUserMgmtGate(identity, { kind: "invite", inviteCount: emails.length });
    for (const path of groupPaths) {
      await consultUserMgmtGate(identity, {
        kind: "addToGroup",
        groupPath: path,
        addCount: emails.length,
      });
    }

    const settled = await Promise.allSettled(
      emails.map((email) => inviteOrganizationUser(org.id, email)),
    );

    // Keycloak returns 409 both for "pending invitation already exists" and
    // "user is already a member" — indistinguishable, and both leave an invitee
    // who should claim the groups, so the assignment is recorded for either
    // outcome. A real error records nothing for that email.
    const outcomes: InviteOutcome[] = emails.map((email, index) => {
      const settledResult = settled[index];
      if (settledResult.status === "fulfilled") {
        return { email, alreadyInvited: false, failed: false };
      }
      const alreadyInvited =
        settledResult.reason instanceof KeycloakAdminError && settledResult.reason.status === 409;
      return { email, alreadyInvited, failed: !alreadyInvited };
    });

    const acceptedEmails = outcomes
      .filter((outcome) => !outcome.failed)
      .map((outcome) => outcome.email);
    if (groupPaths.length > 0 && acceptedEmails.length > 0) {
      await createPendingGroupAssignments(
        requestOrganization,
        acceptedEmails,
        groupPaths,
        user.sub,
      );
    }

    summary = summarize(outcomes, requestOrganization);
  } catch (e) {
    if (e instanceof Response) throw e;
    console.error("Invite failed:", e);
    summary = { message: "Failed to invite user. Please try again.", status: "error" };
  }

  session.set("notification", { status: summary.status, message: summary.message });

  return redirect(adminUrl, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};
