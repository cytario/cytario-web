import { ActionFunctionArgs } from "react-router";

import { removeFavoriteSchema } from "./favorites.schema";
import { removeFavorite } from "./favorites.server";
import { authContext } from "~/.server/auth/authMiddleware";
import { getConnection } from "~/routes/connections/connections.server";

export const removeFavoriteAction = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);

  const formData = await request.formData();
  const parsed = removeFavoriteSchema.safeParse({
    connectionName: formData.get("connectionName"),
    pathName: formData.get("pathName"),
  });

  if (!parsed.success) {
    return new Response("Invalid input", { status: 400 });
  }

  const connection = await getConnection(user, parsed.data.connectionName);
  if (!connection) {
    return new Response("Connection not found", { status: 404 });
  }

  try {
    await removeFavorite(user.sub, parsed.data.connectionName, parsed.data.pathName);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[favorites] Failed to remove favorite:", error);
    return new Response("Internal server error", { status: 500 });
  }
};
