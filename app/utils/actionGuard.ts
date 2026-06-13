import type { ActionFunctionArgs } from "react-router";
import type { z } from "zod";

import type { ConnectionConfig } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { getConnection } from "~/routes/connections/connections.server";

interface GuardedActionArgs<Schema extends z.ZodType<{ connectionName: string }>> {
  args: ActionFunctionArgs;
  schema: Schema;
  /** Label prefix for the 500 log line, e.g. "[favorites] Failed to add favorite:". */
  errorLabel: string;
  handler: (
    data: z.infer<Schema>,
    connection: ConnectionConfig,
    user: UserProfile,
  ) => Promise<void>;
}

/**
 * Shared envelope for the favorites/recents mutation actions: parse form data,
 * authorize the target connection, run the handler, and map failures to the
 * same status codes. Empty strings collapse to undefined so optional fields
 * stay absent.
 */
export async function guardConnectionAction<Schema extends z.ZodType<{ connectionName: string }>>({
  args: { request, context },
  schema,
  errorLabel,
  handler,
}: GuardedActionArgs<Schema>): Promise<Response> {
  const { user } = context.get(authContext);

  const formData = await request.formData();
  const fields = Object.fromEntries(
    Array.from(formData.entries()).map(([key, value]) => [key, value === "" ? undefined : value]),
  );
  const parsed = schema.safeParse(fields);
  if (!parsed.success) {
    return new Response("Invalid input", { status: 400 });
  }

  const connection = await getConnection(user, parsed.data.connectionName);
  if (!connection) {
    return new Response("Connection not found", { status: 404 });
  }

  try {
    await handler(parsed.data, connection, user);
    return Response.json({ ok: true });
  } catch (error) {
    console.error(errorLabel, error);
    return new Response("Internal server error", { status: 500 });
  }
}
