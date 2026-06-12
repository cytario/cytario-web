import { ActionFunctionArgs } from "react-router";

import { addFavoriteSchema } from "./favorites.schema";
import { addFavorite } from "./favorites.server";
import { authContext } from "~/.server/auth/authMiddleware";
import { getConnection } from "~/routes/connections/connections.server";

export const addFavoriteAction = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);

  const formData = await request.formData();
  const parsed = addFavoriteSchema.safeParse({
    connectionName: formData.get("connectionName"),
    pathName: formData.get("pathName"),
    displayName: formData.get("displayName"),
    totalSize: formData.get("totalSize") || undefined,
    lastModified: formData.get("lastModified") || undefined,
  });

  if (!parsed.success) {
    return new Response("Invalid input", { status: 400 });
  }

  const connection = await getConnection(user, parsed.data.connectionName);
  if (!connection) {
    return new Response("Connection not found", { status: 404 });
  }

  try {
    await addFavorite(user.sub, parsed.data);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[favorites] Failed to add favorite:", error);
    return new Response("Internal server error", { status: 500 });
  }
};
