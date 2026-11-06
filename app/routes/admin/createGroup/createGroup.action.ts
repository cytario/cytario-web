import { type ActionFunction, redirect } from "react-router";

import { createGroupSchema } from "./createGroup.schema";
import { adminContext } from "~/.server/auth/adminMiddleware";
import { authContext } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import {
  decodeJwtClaims,
  profileFromTokenClaims,
  withActiveOrganization,
} from "~/.server/auth/getUserInfo";
import { addUserToOrganizationGroup, createGroup } from "~/.server/auth/keycloakAdmin";
import { KeycloakAdminError } from "~/.server/auth/keycloakAdmin/client";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { adminUsersPath } from "~/routes/admin/assertAdminScope";

export const createGroupAction: ActionFunction = async ({ request, context }) => {
  const { user, authTokens, requestOrganization } = context.get(authContext);
  const { org, adminUrl, scope } = context.get(adminContext);

  const formData = await request.formData();
  const result = createGroupSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors };
  }

  const session = await getSession(request);

  try {
    const { path, adminsGroupId, orgId } = await createGroup(scope, result.data.name, org.alias);

    await addUserToOrganizationGroup(orgId, adminsGroupId, user.sub);

    // Re-read the claims so the just-created group is visible; token-derived
    // (the refresh path's claim set). Re-projected to the request org so the
    // session user carries this org's groups for the rest of the request;
    // nothing org-flavored is persisted.
    const refreshedUser = profileFromTokenClaims(decodeJwtClaims(authTokens.accessToken)) ?? user;
    const projectedUser = withActiveOrganization(refreshedUser, requestOrganization);
    session.set("user", projectedUser);

    const newScopeUrl = adminUsersPath(org.alias, path);

    session.set("notification", {
      status: "success",
      message: `Created group "${result.data.name}".`,
    });

    return redirect(newScopeUrl, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  } catch (e) {
    console.error("Create group failed:", e);

    const status = e instanceof KeycloakAdminError ? e.status : undefined;
    const message =
      status === 409
        ? `A group named "${result.data.name}" already exists in this group.`
        : "Failed to create group. Please try again.";

    session.set("notification", {
      status: "error",
      message,
    });
  }

  return redirect(adminUrl, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};
