import { ActionFunctionArgs } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { upsertRecentlyViewed } from "~/utils/recentlyViewed.server";

export const middleware = [authMiddleware];

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);

  if (request.method.toUpperCase() === "POST") {
    const formData = await request.formData();
    const alias = formData.get("alias") as string;
    const pathName = formData.get("pathName") as string;
    const name = formData.get("name") as string;
    const type = formData.get("type") as string;

    if (!alias || pathName == null || !name || !type) {
      return new Response("Missing required fields", { status: 400 });
    }

    await upsertRecentlyViewed(user.sub, {
      alias,
      pathName,
      name,
      type,
    });

    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
};
