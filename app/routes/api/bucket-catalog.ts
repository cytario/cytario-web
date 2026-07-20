import { type LoaderFunctionArgs } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getBucketCatalog } from "~/.server/providers/bucketCatalog.server";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { cytarioConfig } from "~/config";

export const middleware = [requestDurationMiddleware, authMiddleware];

/**
 * The active organization's registered-bucket catalog for the connection-creation
 * bucket picker. Advisory: on a stale/unavailable lookup this returns `{ error }`
 * with 200 so the client degrades to a clear message and never blocks an
 * already-created connection. Present only in admin-portal builds; OSS builds
 * do not register this route (the bucket is entered as free text).
 */
export const loader = async ({ context }: LoaderFunctionArgs) => {
  const source = cytarioConfig.providers.source;

  if (source !== "portal") {
    return Response.json({ source: "oss" }, { headers: { "Cache-Control": "no-store, private" } });
  }

  const { user, authTokens } = context.get(authContext);
  if (!user.organization) {
    return Response.json(
      { source: "portal", error: "No active organization." },
      { status: 200, headers: { "Cache-Control": "no-store, private" } },
    );
  }

  try {
    const catalog = await getBucketCatalog(user.organization, authTokens.accessToken);
    return Response.json(
      { source: "portal", catalog },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    return Response.json(
      {
        source: "portal",
        error: error instanceof Error ? error.message : "Bucket catalog is unavailable.",
      },
      { status: 200, headers: { "Cache-Control": "no-store, private" } },
    );
  }
};
