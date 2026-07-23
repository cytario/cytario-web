import { type ActionFunctionArgs, redirect } from "react-router";

import { applyGrantsAndRecordStatus, validateProviderRefs } from "./connectionGrant.server";
import { createConnection } from "./createConnection.action";
import { shareFolderSchema } from "./shareFolder.schema";
import { Prisma } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { assertGrantScope } from "~/routes/admin/assertAdminScope";

/**
 * Create a folder share and apply its bucket-policy grant. Order of enforcement is
 * load-bearing:
 *   1. parse + validate the submitted grants (bucket/prefix validated by the schema);
 *   2. authorize every SUBMITTED target scope server-side — HTTP 403 with no mint and
 *      no bucket-policy write on failure;
 *   3. resolve every grant's provider role from the catalog and reject unknown or
 *      non-covering roles (any role is accepted — read-only or sharing-capable;
 *      the bucket-policy write picks a sharing-capable grant's role via
 *      resolveApplyTarget);
 *   4. create the share connection;
 *   5. apply the desired managed grant set under a sharing-capable role borrowed
 *      from any connection on the same bucket, warning (never claiming enforced)
 *      when the write is denied.
 */
export const shareAction = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);
  const session = context.get(sessionContext);
  if (!user.organization) {
    throw new Error("Active organization missing from session");
  }

  const formData = await request.formData();
  const rawData = {
    name: String(formData.get("name") ?? ""),
    bucketName: String(formData.get("bucketName") ?? ""),
    providerConnectionId: String(formData.get("providerConnectionId") ?? ""),
    prefix: String(formData.get("prefix") ?? ""),
    grants: parseShareGrants(formData),
  };

  const result = shareFolderSchema.safeParse(rawData);
  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors, status: "error" as const };
  }
  const data = result.data;

  for (const grant of data.grants) {
    assertGrantScope(grant.scope, user.adminScopes);
  }

  let catalog;
  try {
    catalog = await getProviderCatalog(user.organization, session.get("authTokens")?.accessToken);
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

  try {
    const share = await createConnection(
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

    const outcome = await applyGrantsAndRecordStatus(share, {
      user,
      idToken: session.get("authTokens")?.idToken ?? "",
      accessToken: session.get("authTokens")?.accessToken ?? "",
    });

    session.set("notification", {
      status: outcome.status === "applied" ? "success" : "warning",
      message:
        outcome.status === "applied"
          ? "Folder shared successfully."
          : `Share created. ${outcome.warning}`,
    });

    return redirect(`/connections/${share.id}`, {
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
      return {
        formError: "A database constraint was violated. Please check your input and try again.",
        status: "error" as const,
      };
    }
    console.error("Error sharing folder:", error);
    return {
      formError: "Could not share the folder. Try again or check the server logs.",
      status: "error" as const,
    };
  }
};

function parseShareGrants(formData: FormData) {
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
