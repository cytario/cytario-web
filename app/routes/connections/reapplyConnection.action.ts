import { type ActionFunctionArgs, redirect } from "react-router";

import { applyGrantsAndRecordStatus } from "./connectionGrant.server";
import { authContext } from "~/.server/auth/authMiddleware";
import {
  getOrExchangeOrgAccessToken,
  getOrExchangeOrgToken,
} from "~/.server/auth/orgTokenExchange";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { prisma } from "~/.server/db/prisma";
import { assertGrantScope } from "~/routes/admin/assertAdminScope";
import { canModify } from "~/utils/authorization";
import { orgPath } from "~/utils/orgPath";

/** Re-apply a connection's bucket-policy grant so a drifted or errored
 * connection converges back to `applied` (or warns when the write is denied).
 * Authorizes every grant's scope server-side before minting any write
 * session. */
export const reapplyAction = async ({ request, context }: ActionFunctionArgs) => {
  const { user, authTokens, sessionId, requestOrganization, entitlements } =
    context.get(authContext);
  const session = context.get(sessionContext);
  if (!requestOrganization) {
    throw new Error("Active organization missing from session");
  }
  const portalAccessToken = (
    await getOrExchangeOrgAccessToken(sessionId, requestOrganization, authTokens.accessToken)
  ).accessToken;

  const formData = await request.formData();
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) {
    return { error: "Connection id is required" };
  }

  const config = await prisma.connectionConfig.findFirst({
    where: { id: connectionId, organization: requestOrganization },
    include: { grants: true },
  });
  if (!config || !canModify(user, config, requestOrganization)) {
    throw new Response("Not authorized", { status: 403 });
  }

  for (const grant of config.grants) {
    assertGrantScope(grant.scope, entitlements.adminScopes);
  }

  const outcome = await applyGrantsAndRecordStatus(config, {
    user,
    idToken: (await getOrExchangeOrgToken(sessionId, requestOrganization, authTokens.accessToken))
      .accessToken,
    accessToken: portalAccessToken,
  });

  session.set("notification", {
    status: outcome.status === "applied" ? "success" : "warning",
    message:
      outcome.status === "applied"
        ? "Bucket policy re-applied."
        : `Could not re-apply the bucket policy. ${outcome.warning}`,
  });

  return redirect(orgPath(requestOrganization, "/"), {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};
