import { type ActionFunction, redirect } from "react-router";

import { inviteUserSchema } from "./inviteUser.schema";
import { adminContext } from "~/.server/auth/adminMiddleware";
import { authContext } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import { toIdentity } from "~/.server/auth/getUserInfo";
import { inviteOrganizationUser } from "~/.server/auth/keycloakAdmin";
import { KeycloakAdminError } from "~/.server/auth/keycloakAdmin/client";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { consultUserMgmtGate } from "~/.server/userManagementGate";

export const inviteUserAction: ActionFunction = async ({ request, context }) => {
  const { user } = context.get(authContext);
  const { org, adminUrl } = context.get(adminContext);

  const formData = await request.formData();
  const inviteAnother = formData.get("inviteAnother") === "true";
  const rawData = Object.fromEntries(formData);
  const result = inviteUserSchema.safeParse(rawData);

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors };
  }

  const session = await getSession(request);

  try {
    await consultUserMgmtGate(toIdentity(user), { kind: "invite", inviteCount: 1 });

    await inviteOrganizationUser(
      org.id,
      result.data.email,
      result.data.firstName || undefined,
      result.data.lastName || undefined,
    );

    const message = `Invited ${result.data.email} to ${user.organization}.`;
    if (inviteAnother) {
      return { success: true, message };
    }
    session.set("notification", { status: "success", message });
  } catch (e) {
    if (e instanceof Response) throw e;
    const status = e instanceof KeycloakAdminError ? e.status : undefined;
    if (status === 409) {
      // Keycloak returns 409 for both "pending invitation already exists" and
      // "user is already a member" — benign no-ops, so surface as a warning.
      const message = `${result.data.email} already has a pending invitation or is a member.`;
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
