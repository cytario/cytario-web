import { type ActionFunction } from "react-router";
import { z } from "zod";

import { authContext } from "~/.server/auth/authMiddleware";
import {
  adminFetch,
  addUserToGroup,
  removeUserFromGroup,
  updateUser,
  type KeycloakUser,
} from "~/.server/auth/keycloakAdmin";

const toggleGroupMembershipSchema = z.object({
  action: z.literal("toggleGroupMembership"),
  userId: z.string(),
  groupId: z.string(),
  isMember: z.enum(["true", "false"]),
});

const toggleUserEnabledSchema = z.object({
  action: z.literal("toggleUserEnabled"),
  userId: z.string(),
  enabled: z.enum(["true", "false"]),
});

export const usersAction: ActionFunction = async ({ request, context }) => {
  const { user, authTokens } = context.get(authContext);
  const scope = new URL(request.url).searchParams.get("scope");

  if (!scope) throw new Response("Missing scope", { status: 400 });

  const isAdmin = user.adminScopes.some(
    (s) => scope === s || scope.startsWith(s + "/"),
  );

  if (!isAdmin) {
    return { error: "Unauthorized" };
  }

  const formData = await request.formData();
  const data = Object.fromEntries(formData);

  try {
    if (data.action === "toggleGroupMembership") {
      const { userId, groupId, isMember } =
        toggleGroupMembershipSchema.parse(data);

      if (isMember === "true") {
        await removeUserFromGroup(authTokens.accessToken, userId, groupId);
      } else {
        await addUserToGroup(authTokens.accessToken, userId, groupId);
      }

      return { success: true };
    }

    if (data.action === "toggleUserEnabled") {
      const { userId, enabled } = toggleUserEnabledSchema.parse(data);

      const userToUpdate = await adminFetch<KeycloakUser>(
        authTokens.accessToken,
        `/users/${userId}`,
      );

      await updateUser(authTokens.accessToken, userId, {
        ...userToUpdate,
        enabled: enabled !== "true",
      });

      return { success: true };
    }

    return { error: "Invalid action" };
  } catch (error) {
    console.error("Action failed:", error);
    return { error: "Operation failed" };
  }
};
