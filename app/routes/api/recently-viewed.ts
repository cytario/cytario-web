import { ActionFunctionArgs } from "react-router";
import { z } from "zod";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { upsertRecentlyViewed } from "~/utils/recentlyViewed.server";

const recentlyViewedSchema = z.object({
  alias: z.string().min(1),
  pathName: z.string(),
  name: z.string().min(1),
  type: z.enum(["file", "directory"]),
});

export const middleware = [authMiddleware];

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);

  if (request.method.toUpperCase() === "POST") {
    const formData = await request.formData();
    const parsed = recentlyViewedSchema.safeParse({
      alias: formData.get("alias"),
      pathName: formData.get("pathName"),
      name: formData.get("name"),
      type: formData.get("type"),
    });

    if (!parsed.success) {
      return new Response("Invalid input", { status: 400 });
    }

    await upsertRecentlyViewed(user.sub, parsed.data);
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
};
