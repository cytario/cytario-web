import { ActionFunctionArgs } from "react-router";

import { clearAllRecentlyViewed } from "./recent.server";
import { authContext } from "~/.server/auth/authMiddleware";

export const clearRecentlyViewed = async ({ context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);
  await clearAllRecentlyViewed(user.sub);
  return { ok: true };
};
