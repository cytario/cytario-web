import { type ActionFunctionArgs, redirect } from "react-router";

import { applyBucketGrantSet } from "./connectionGrant.server";
import type { ConnectionConfigWithGrants } from "~/.server/auth/authMiddleware";
import { authContext } from "~/.server/auth/authMiddleware";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { prisma } from "~/.server/db/prisma";
import { canModify, canSee } from "~/utils/authorization";

export async function deleteConnection(
  user: UserProfile,
  connectionId: string,
): Promise<ConnectionConfigWithGrants> {
  if (!user.organization) {
    throw new Error("Active organization missing from session");
  }

  const config = await prisma.connectionConfig.findFirst({
    where: { id: connectionId, organization: user.organization },
    include: { grants: true },
  });

  if (!config || !canSee(user, config)) {
    throw new Error("Connection config not found");
  }

  if (!canModify(user, config)) {
    throw new Error("Not authorized to delete this connection config");
  }

  await prisma.connectionConfig.delete({ where: { id: config.id } });
  return config;
}

export const deleteAction = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);
  const session = context.get(sessionContext);
  const formData = await request.formData();
  const connectionId = String(formData.get("connectionId") ?? "");

  if (!connectionId) {
    return { error: "Connection id is required" };
  }

  let deleted: ConnectionConfigWithGrants;
  try {
    deleted = await deleteConnection(user, connectionId);
  } catch (error) {
    if (error instanceof Error) {
      session.set("notification", { status: "error", message: error.message });
      return redirect("/connections", {
        headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
      });
    }
    throw error;
  }

  const credentials = session.get("credentials") ?? {};
  delete credentials[deleted.id];
  session.set("credentials", credentials);

  // Revoke the grant this share added: re-apply the bucket's remaining managed
  // grant set under the acting write session. Because the deleted record is now
  // absent from the set, the read-merge-write removes its managed Sid
  // statement(s) — idempotent and all-or-nothing. When the acting session cannot
  // apply the revoke, warn and do NOT claim the grant was withdrawn.
  let notification = { status: "success" as "success" | "warning", message: "Connection deleted." };
  if (user.organization) {
    const outcome = await applyBucketGrantSet(
      {
        organization: user.organization,
        providerConnectionId: deleted.providerConnectionId,
        bucketName: deleted.bucketName,
      },
      deleted,
      {
        user,
        idToken: session.get("authTokens")?.idToken ?? "",
        accessToken: session.get("authTokens")?.accessToken ?? "",
      },
    );
    if (outcome.status !== "applied") {
      notification = {
        status: "warning",
        message: `Connection removed, but the bucket-policy grant could not be revoked. ${outcome.warning}`,
      };
    }
  }

  session.set("notification", notification);

  return redirect("/connections", {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};
