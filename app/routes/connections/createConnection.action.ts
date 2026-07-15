import { type ActionFunctionArgs, redirect } from "react-router";

import { connectionSchema } from "./connection.schema";
import { applyGrantsAndRecordStatus, validateProviderRefs } from "./connectionGrant.server";
import { Prisma } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { prisma } from "~/.server/db/prisma";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { canCreate } from "~/utils/authorization";

export interface CreateConnectionInput {
  name: string;
  bucketName: string;
  providerConnectionId: string;
  providerRoleId: string;
  prefix: string;
}

/**
 * Strictly creates — never updates an existing row. An existing
 * (organization, providerConnectionId, bucketName, prefix) tuple must surface
 * as a conflict: silently repointing the existing connection would let a
 * non-admin rewrite another scope's connection (and thereby shrink the
 * bucket's managed grant set) without any canModify check.
 */
export async function createConnection(
  organization: string,
  scope: string,
  createdBy: string,
  config: CreateConnectionInput,
) {
  return prisma.connectionConfig.create({
    data: {
      organization,
      scope,
      createdBy,
      ...config,
    },
  });
}

/** Field-level message for a P2002 unique violation on connection create. */
export function uniqueViolationErrors(error: Prisma.PrismaClientKnownRequestError) {
  const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];
  if (target.includes("name")) {
    return { name: ["This name is already taken. Please choose another."] };
  }
  return {
    prefix: ["A connection for this bucket and prefix already exists. Edit it instead."],
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
    scope: String(formData.get("scope") ?? ""),
    providerConnectionId: String(formData.get("providerConnectionId") ?? ""),
    providerRoleId: String(formData.get("providerRoleId") ?? ""),
    bucketName: String(formData.get("bucketName") ?? ""),
    prefix: String(formData.get("prefix") ?? ""),
  };

  const result = connectionSchema.safeParse(rawData);
  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors, status: "error" as const };
  }
  const data = result.data;

  if (!canCreate(user, { organization: user.organization, ownerScope: data.scope })) {
    return {
      errors: { scope: ["Not authorized to create in this scope"] },
      status: "error" as const,
    };
  }

  // Validate the referenced provider connection + role against the catalog and
  // reject unknown ids — no free-text role/endpoint is accepted. The catalog is
  // advisory; when it is unavailable the create is refused with a clear error
  // rather than trusting a bare id.
  let catalog;
  try {
    catalog = await getProviderCatalog(user.organization, authTokens.accessToken);
  } catch (error) {
    return {
      formError:
        error instanceof Error ? error.message : "Provider catalog is currently unavailable.",
      status: "error" as const,
    };
  }
  const refs = validateProviderRefs(catalog, data, { userSub: user.sub });
  if (!refs.ok) {
    return { errors: refs.errors, status: "error" as const };
  }

  const session = context.get(sessionContext);

  try {
    const created = await createConnection(user.organization, data.scope, user.sub, {
      name: data.name,
      bucketName: data.bucketName,
      providerConnectionId: data.providerConnectionId,
      providerRoleId: data.providerRoleId,
      prefix: data.prefix,
    });
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

    return redirect(`/connections/${encodeURIComponent(data.name)}`, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { errors: uniqueViolationErrors(error), status: "error" as const };
    }

    console.error("Error creating connection:", error);
    return {
      formError: "Could not add the connection. Try again or check the server logs.",
      status: "error" as const,
    };
  }
};
