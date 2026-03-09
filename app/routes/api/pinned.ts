import { ActionFunctionArgs } from "react-router";
import { z } from "zod";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { addPinnedPath, removePinnedPath } from "~/utils/pinnedPaths.server";

const pinSchema = z.object({
  alias: z.string().min(1),
  pathName: z.string(),
  displayName: z.string().min(1),
  totalSize: z.coerce.number().optional(),
  lastModified: z.coerce.number().optional(),
});

const unpinSchema = z.object({
  alias: z.string().min(1),
  pathName: z.string(),
});

export const middleware = [authMiddleware];

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);

  const formData = await request.formData();

  if (request.method.toUpperCase() === "POST") {
    const parsed = pinSchema.safeParse({
      alias: formData.get("alias"),
      pathName: formData.get("pathName"),
      displayName: formData.get("displayName"),
      totalSize: formData.get("totalSize") || undefined,
      lastModified: formData.get("lastModified") || undefined,
    });

    if (!parsed.success) {
      return new Response("Invalid input", { status: 400 });
    }

    await addPinnedPath(user.sub, parsed.data);
    return Response.json({ ok: true });
  }

  if (request.method.toUpperCase() === "DELETE") {
    const parsed = unpinSchema.safeParse({
      alias: formData.get("alias"),
      pathName: formData.get("pathName"),
    });

    if (!parsed.success) {
      return new Response("Invalid input", { status: 400 });
    }

    await removePinnedPath(user.sub, parsed.data.alias, parsed.data.pathName);
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
};
