import { type LoaderFunctionArgs } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getOrExchangeOrgAccessToken } from "~/.server/auth/orgTokenExchange";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { toClientCatalog } from "~/utils/providerCatalog.schema";

export const middleware = [requestDurationMiddleware, authMiddleware];

/**
 * The request org's provider catalog, browser projection — no role ARNs, no
 * ExternalId, no management credential. Served under `/api/v1/:org/...`, so the
 * org is the URL segment, membership-validated by `authMiddleware` before this
 * loader runs. Advisory: on a stale/unavailable lookup this returns `{ error }`
 * with 200 so the client degrades to a clear message and never blocks an
 * already-created connection.
 */
export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { authTokens, sessionId, requestOrganization } = context.get(authContext);
  const organization = requestOrganization;
  if (!organization) {
    return Response.json({ error: "No active organization." }, { status: 200 });
  }

  try {
    // A narrow per-org token — the portal rejects the multi-membership
    // session token.
    const portalToken = (
      await getOrExchangeOrgAccessToken(sessionId, organization, authTokens.accessToken)
    ).accessToken;
    const catalog = await getProviderCatalog(organization, portalToken);
    return Response.json(
      { catalog: toClientCatalog(catalog) },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    // Advisory 200 to the client, so the failure would otherwise leave no
    // server-side trace — log which stage failed (exchange vs lookup) with the
    // org it happened for.
    console.warn(
      `[providers] Catalog lookup for organization "${organization}" failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return Response.json(
      { error: error instanceof Error ? error.message : "Provider catalog is unavailable." },
      { status: 200 },
    );
  }
};
