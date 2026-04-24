import { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getConnection } from "~/routes/connections/connections.server";
import {
  addPinnedPath,
  checkIsPinnedPath,
  removePinnedPath,
} from "~/utils/pinnedPaths.server";

const pinSchema = z.object({
  connectionName: z.string().min(1),
  pathName: z.string(),
  displayName: z.string().min(1),
  totalSize: z.coerce.number().optional(),
  lastModified: z.coerce.number().optional(),
});

const unpinSchema = z.object({
  connectionName: z.string().min(1),
  pathName: z.string(),
});

export const middleware = [authMiddleware];

/**
 * GET /api/pinned?connectionName=X&pathName=Y — returns whether the given
 * (connection, path) is pinned by the authenticated user. Called from the
 * objects route on navigation to populate the pin button state, since the
 * route loader is connection-stable and doesn't re-run on path changes.
 */
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { user } = context.get(authContext);

  const url = new URL(request.url);
  const connectionName = url.searchParams.get("connectionName");
  const pathName = url.searchParams.get("pathName");

  if (!connectionName || pathName === null) {
    return new Response(
      "connectionName and pathName query params are required",
      { status: 400 },
    );
  }

  const isPinned = await checkIsPinnedPath(user.sub, connectionName, pathName);
  return Response.json({ isPinned });
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);

  const formData = await request.formData();

  if (request.method.toUpperCase() === "POST") {
    const parsed = pinSchema.safeParse({
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
      await addPinnedPath(user.sub, parsed.data);
      return Response.json({ ok: true });
    } catch (error) {
      console.error("[pinned] Failed to add pin:", error);
      return new Response("Internal server error", { status: 500 });
    }
  }

  if (request.method.toUpperCase() === "DELETE") {
    const parsed = unpinSchema.safeParse({
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
      await removePinnedPath(user.sub, parsed.data.connectionName, parsed.data.pathName);
      return Response.json({ ok: true });
    } catch (error) {
      console.error("[pinned] Failed to remove pin:", error);
      return new Response("Internal server error", { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
};
