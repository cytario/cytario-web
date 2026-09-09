import { type ActionFunctionArgs, redirect } from "react-router";

import { connectionSchema } from "./connection.schema";
import { applyGrantsAndRecordStatus } from "./connectionGrant.server";
import { Prisma } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import {
  createConnectionRecord,
  validateConnectionAgainstCatalogs,
} from "~/.server/connections/createConnection.server";
import type { GrantInput } from "~/.server/connections/createConnection.server";
import { canCreate } from "~/utils/authorization";

/** A connection config field set for `createConnectionRecord`. */
export type {
  CreateConnectionInput,
  GrantInput,
} from "~/.server/connections/createConnection.server";

/**
 * Parse the repeating grants group from the submitted formData. The form emits
 * `grants[<index>].scope` / `grants[<index>].accessLevel` pairs.
 */
export function parseGrants(formData: FormData): GrantInput[] {
  const indexSet = new Set<number>();
  for (const key of formData.keys()) {
    const match = key.match(/^grants\[(\d+)\]\.scope$/);
    if (match) indexSet.add(Number(match[1]));
  }
  return [...indexSet]
    .sort((a, b) => a - b)
    .map((index) => ({
      scope: String(formData.get(`grants[${index}].scope`) ?? ""),
      accessLevel: String(formData.get(`grants[${index}].accessLevel`) ?? ""),
    }));
}

export const createConnection = createConnectionRecord;

/** Field-level message for a P2002 unique violation on connection create. */
export function uniqueViolationErrors(error: Prisma.PrismaClientKnownRequestError) {
  const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];
  if (target.includes("scope")) {
    return { grants: ["Each group may appear at most once on a connection."] };
  }
  return {
    formError: "A database constraint was violated. Please check your input and try again.",
  };
}

export const createAction = async ({ request, context }: ActionFunctionArgs) => {
  const { user, authTokens } = context.get(authContext);
  if (!user.organization) {
    throw new Error("Active organization missing from session");
  }

  const formData = await request.formData();

  const rawData = {
    name: String(formData.get("name") ?? ""),
    providerConnectionId: String(formData.get("providerConnectionId") ?? ""),
    bucketName: String(formData.get("bucketName") ?? ""),
    prefix: String(formData.get("prefix") ?? ""),
    grants: parseGrants(formData),
  };

  const result = connectionSchema.safeParse(rawData);
  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors, status: "error" as const };
  }
  const data = result.data;

  for (const grant of data.grants) {
    if (!canCreate(user, { organization: user.organization, ownerScope: grant.scope })) {
      return {
        errors: { grants: [`Not authorized to create a grant for scope "${grant.scope}"`] },
        status: "error" as const,
      };
    }
  }

  const validated = await validateConnectionAgainstCatalogs(
    user.organization,
    authTokens.accessToken,
    data,
  );
  if (!validated.ok) {
    if (validated.error === "catalog") {
      return { formError: validated.message, status: "error" as const };
    }
    return {
      errors: validated.errors ?? {},
      formError: validated.formError || undefined,
      status: "error" as const,
    };
  }

  const session = context.get(sessionContext);

  try {
    const created = await createConnectionRecord(
      user.organization,
      user.sub,
      {
        name: data.name,
        bucketName: data.bucketName,
        providerConnectionId: data.providerConnectionId,
        prefix: data.prefix,
      },
      data.grants,
    );
    const outcome = await applyGrantsAndRecordStatus(created, {
      user,
      idToken: session.get("authTokens")?.idToken ?? "",
      accessToken: session.get("authTokens")?.accessToken ?? "",
    });
    session.set("notification", {
      status: outcome.status === "applied" ? "success" : "warning",
      message:
        outcome.status === "applied"
          ? "Connection added successfully."
          : `Connection added. ${outcome.warning}`,
    });

    return redirect(`/connections/${created.id}`, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];
      if (target.includes("scope")) {
        return {
          errors: { grants: ["Each group may appear at most once on a connection."] },
          status: "error" as const,
        };
      }
      return { errors: uniqueViolationErrors(error), status: "error" as const };
    }

    console.error("Error creating connection:", error);
    return {
      formError: "Could not add the connection. Try again or check the server logs.",
      status: "error" as const,
    };
  }
};
