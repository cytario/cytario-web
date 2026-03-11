import { ActionFunctionArgs } from "react-router";
import { z } from "zod";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getConnectionByName } from "~/utils/connectionConfig.server";
import { upsertRecentlyViewed } from "~/utils/recentlyViewed.server";

const recentlyViewedSchema = z.object({
  connectionName: z.string().min(1),
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
      connectionName: formData.get("connectionName"),
      pathName: formData.get("pathName"),
      name: formData.get("name"),
      type: formData.get("type"),
    });

    if (!parsed.success) {
      return new Response("Invalid input", { status: 400 });
    }

    const connection = await getConnectionByName(user, parsed.data.connectionName);
    if (!connection) {
      return new Response("Connection not found", { status: 404 });
    }

    try {
      await upsertRecentlyViewed(user.sub, parsed.data);
      return Response.json({ ok: true });
    } catch (error) {
      console.error("[recently-viewed] Failed to upsert:", error);
      return new Response("Internal server error", { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
};
