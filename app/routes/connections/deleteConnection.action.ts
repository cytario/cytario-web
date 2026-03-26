import { type ActionFunctionArgs, redirect } from "react-router";

import { authContext } from "~/.server/auth/authMiddleware";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { deleteConnectionConfig } from "~/utils/connectionConfig.server";

export const deleteConnectionAction = async ({
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

  await deleteConnectionConfig(user, connectionName);

  session.set("notification", {
    status: "success",
    message: "Storage connection deleted.",
  });

  return redirect("/connections", {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
};
