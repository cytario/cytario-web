import { ActionFunctionArgs } from "react-router";

import { recordViewedSchema } from "./recent.schema";
import { upsertRecentlyViewed } from "./recent.server";
import { authContext } from "~/.server/auth/authMiddleware";
import { getConnection } from "~/routes/connections/connections.server";

export const recordRecentlyViewed = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);

  const formData = await request.formData();
  const parsed = recordViewedSchema.safeParse({
    connectionName: formData.get("connectionName"),
    pathName: formData.get("pathName"),
    name: formData.get("name"),
    type: formData.get("type"),
  });

  if (!parsed.success) {
    return new Response("Invalid input", { status: 400 });
  }

  const connection = await getConnection(user, parsed.data.connectionName);
  if (!connection) {
    return new Response("Connection not found", { status: 404 });
  }

  try {
    await upsertRecentlyViewed(user.sub, parsed.data);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[recent] Failed to upsert:", error);
    return new Response("Internal server error", { status: 500 });
  }
};
