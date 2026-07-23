import { type ActionFunctionArgs, redirect } from "react-router";

import { applyGrantsAndRecordStatus } from "./connectionGrant.server";
import { authContext } from "~/.server/auth/authMiddleware";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { prisma } from "~/.server/db/prisma";
import { assertGrantScope } from "~/routes/admin/assertAdminScope";
import { canModify } from "~/utils/authorization";

/**
 * Re-apply a connection's bucket-policy grant: recompute the bucket's full managed
 * grant set and re-apply it under the acting connection's provider-role write
 * session, so a drifted or errored connection converges back to `applied` (or
 * warns when the write is denied). Authorizes every grant's scope server-side
 * before minting any write session.
 */
export const reapplyAction = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);
  const session = context.get(sessionContext);
  if (!user.organization) {
    throw new Error("Active organization missing from session");
  }

  const formData = await request.formData();
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) {
    return { error: "Connection id is required" };
  }

  const config = await prisma.connectionConfig.findFirst({
    where: { id: connectionId, organization: user.organization },
    include: { grants: true },
  });
  if (!config || !canModify(user, config)) {
    throw new Response("Not authorized", { status: 403 });
  }

  for (const grant of config.grants) {
    assertGrantScope(grant.scope, user.adminScopes);
  }

  const outcome = await applyGrantsAndRecordStatus(config, {
    user,
    idToken: session.get("authTokens")?.idToken ?? "",
    accessToken: session.get("authTokens")?.accessToken ?? "",
  });

  session.set("notification", {
    status: outcome.status === "applied" ? "success" : "warning",
    message:
      outcome.status === "applied"
        ? "Bucket policy re-applied."
        : `Could not re-apply the bucket policy. ${outcome.warning}`,
  });

  return redirect("/connections", {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};
