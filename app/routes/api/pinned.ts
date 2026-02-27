import { ActionFunctionArgs } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { addPinnedPath, removePinnedPath } from "~/utils/pinnedPaths.server";

export const middleware = [authMiddleware];

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);

  const formData = await request.formData();
  const provider = formData.get("provider") as string;
  const bucketName = formData.get("bucketName") as string;
  const pathName = formData.get("pathName") as string;

  if (!provider || !bucketName || pathName == null) {
    return new Response("Missing required fields", { status: 400 });
  }

  if (request.method.toUpperCase() === "POST") {
    const displayName = formData.get("displayName") as string;
    const totalSizeRaw = formData.get("totalSize");
    const lastModifiedRaw = formData.get("lastModified");

    if (!displayName) {
      return new Response("Missing displayName", { status: 400 });
    }

    await addPinnedPath(user.sub, {
      provider,
      bucketName,
      pathName,
      displayName,
      totalSize:
        totalSizeRaw != null && totalSizeRaw !== ""
          ? Number(totalSizeRaw)
          : undefined,
      lastModified:
        lastModifiedRaw != null && lastModifiedRaw !== ""
          ? Number(lastModifiedRaw)
          : undefined,
    });

    return Response.json({ ok: true });
  }

  if (request.method.toUpperCase() === "DELETE") {
    await removePinnedPath(user.sub, provider, bucketName, pathName);
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
};
