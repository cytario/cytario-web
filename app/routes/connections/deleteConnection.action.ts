import { type ActionFunctionArgs, redirect } from "react-router";

import { authContext } from "~/.server/auth/authMiddleware";
import { canModify, canSee } from "~/.server/auth/authorization";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { prisma } from "~/.server/db/prisma";

/** Delete a connection config by name. Checks visibility and modify authorization. */
export async function deleteConnection(user: UserProfile, name: string) {
  const config = await prisma.connectionConfig.findUnique({
    where: { name },
  });

  if (!config || !canSee(user, config.ownerScope)) {
    throw new Error("Connection config not found");
  }

  if (!canModify(user, config.ownerScope)) {
    throw new Error("Not authorized to delete this connection config");
  }

  await prisma.connectionConfig.delete({ where: { id: config.id } });
}

export const deleteAction = async ({
  request,
  context,
}: ActionFunctionArgs) => {
  const { user } = context.get(authContext);
  const session = context.get(sessionContext);
  const formData = await request.formData();
  const connectionName = String(formData.get("connectionName") ?? "");

  if (!connectionName) {
    return { error: "Connection name is required" };
  }

  await deleteConnection(user, connectionName);

  session.set("notification", {
    status: "success",
    message: "Storage connection deleted.",
  });

  return redirect("/connections", {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};
