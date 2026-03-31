import { type ActionFunctionArgs, data } from "react-router";

import { Prisma } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { updateConnectionScope } from "~/utils/connectionConfig.server";

export const updateConnectionScopeAction = async ({
  request,
  context,
}: ActionFunctionArgs) => {
  const { user } = context.get(authContext);
  const session = context.get(sessionContext);
  const formData = await request.formData();
  const connectionName = String(formData.get("connectionName") ?? "");
  const newOwnerScope = String(formData.get("newOwnerScope") ?? "");

  if (!connectionName || !newOwnerScope) {
    return { error: "Connection name and scope are required", status: "error" as const };
  }

  try {
    await updateConnectionScope(user, connectionName, newOwnerScope);

    session.set("notification", {
      status: "success",
      message: "Connection visibility updated.",
    });

    return data(
      { status: "success" as const },
      { headers: { "Set-Cookie": await sessionStorage.commitSession(session) } },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        error: "A connection to this bucket already exists under that scope.",
        status: "error" as const,
      };
    }

    if (error instanceof Error && error.message.startsWith("Not authorized")) {
      return { error: error.message, status: "error" as const };
    }

    throw error;
  }
};
