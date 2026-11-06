import { ActionFunctionArgs } from "react-router";

import { clearAllRecentlyViewed } from "./recent.server";
import { authContext } from "~/.server/auth/authMiddleware";

export const clearRecentlyViewed = async ({ context }: ActionFunctionArgs) => {
  const { user, requestOrganization } = context.get(authContext);

  try {
    await clearAllRecentlyViewed(user.sub, requestOrganization);
    return { ok: true };
  } catch (error) {
    console.error("[recent] Failed to clear history:", error);
    return new Response("Internal server error", { status: 500 });
  }
};
