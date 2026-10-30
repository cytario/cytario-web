import { type LoaderFunctionArgs } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getOrExchangeOrgAccessToken } from "~/.server/auth/orgTokenExchange";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { toClientCatalog } from "~/utils/providerCatalog.schema";

export const middleware = [requestDurationMiddleware, authMiddleware];

/**
 * The active organization's provider catalog, browser projection — no role
 * ARNs, no ExternalId, no management credential. Advisory: on a
 * stale/unavailable lookup this returns `{ error }` with 200 so the client
 * degrades to a clear message and never blocks an already-created
 * connection.
 */
export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { user, authTokens, sessionId } = context.get(authContext);
  if (!user.organization) {
    return Response.json({ error: "No active organization." }, { status: 200 });
  }

  try {
    // A narrow per-org token: the portal rejects the multi-membership session
    // token a multi-org user carries.
    const portalToken = (
      await getOrExchangeOrgAccessToken(sessionId, user.organization, authTokens.accessToken)
    ).accessToken;
    const catalog = await getProviderCatalog(user.organization, portalToken);
    return Response.json(
      { catalog: toClientCatalog(catalog) },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Provider catalog is unavailable." },
      { status: 200 },
    );
  }
};
