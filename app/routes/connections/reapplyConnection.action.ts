import { type ActionFunctionArgs, redirect } from "react-router";

import { applyGrantsAndRecordStatus, connectionIsGroupScoped } from "./connectionGrant.server";
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
 * warns when the write is denied). Authorizes the connection's scope server-side
 * before minting any write session.
 */
export const reapplyAction = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);
  const session = context.get(sessionContext);
  if (!user.organization) {
    throw new Error("Active organization missing from session");
  }

  const formData = await request.formData();
  const connectionName = String(formData.get("connectionName") ?? "");
  if (!connectionName) {
    return { error: "Connection name is required" };
  }

  const config = await prisma.connectionConfig.findFirst({
    where: { name: connectionName, organization: user.organization },
  });
  if (!config || !canModify(user, config)) {
    throw new Response("Not authorized", { status: 403 });
  }

  // Only a group-scoped connection carries a managed grant needing the grant
  // authorization; a personal or org-root connection re-applies (and thereby
  // prunes stale statements) under canModify alone.
  if (connectionIsGroupScoped(config, user.sub)) {
    assertGrantScope(config.scope, user.adminScopes);
  }

  const outcome = await applyGrantsAndRecordStatus(config, {
    user,
    idToken: session.get("authTokens")?.idToken ?? "",
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
