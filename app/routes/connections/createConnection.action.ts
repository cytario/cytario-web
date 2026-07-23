import { type ActionFunctionArgs, redirect } from "react-router";

import { connectionSchema } from "./connection.schema";
import {
  applyGrantsAndRecordStatus,
  validateBucketRef,
  validateProviderRefs,
} from "./connectionGrant.server";
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
  prefix: string;
}

export interface GrantInput {
  scope: string;
  providerRoleId: string;
}

/**
 * Parse the repeating grants group from the submitted formData. The form emits
 * `grants[<index>].scope` / `grants[<index>].providerRoleId` pairs.
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
      providerRoleId: String(formData.get(`grants[${index}].providerRoleId`) ?? ""),
    }));
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
  createdBy: string,
  config: CreateConnectionInput,
  grants: GrantInput[],
) {
  return prisma.connectionConfig.create({
    data: {
      organization,
      createdBy,
      ...config,
      grants: {
        createMany: {
          data: grants.map((g) => ({ scope: g.scope, providerRoleId: g.providerRoleId })),
        },
      },
    },
    include: { grants: true },
  });
}

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
  const refs = validateProviderRefs(catalog, data);
  if (!refs.ok) {
    return { errors: refs.errors, status: "error" as const };
  }

  const bucketRef = await validateBucketRef(user.organization, authTokens.accessToken, data);
  if (!bucketRef.ok) {
    if ("formError" in bucketRef) {
      return { formError: bucketRef.formError, status: "error" as const };
    }
    return { errors: bucketRef.errors, status: "error" as const };
  }

  const session = context.get(sessionContext);

  try {
    const created = await createConnection(
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
