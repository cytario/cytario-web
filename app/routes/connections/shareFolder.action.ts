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
 *   1. parse + validate the submitted grant (bucket/prefix validated by the schema);
 *   2. authorize the SUBMITTED target scope server-side — HTTP 403 with no mint and
 *      no bucket-policy write on failure;
 *   3. resolve the chosen provider role from the catalog and reject unknown or
 *      non-covering roles;
 *   4. create the share connection;
 *   5. apply the desired managed grant set under the acting connection's provider
 *      role, warning (never claiming enforced) when the write is denied.
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
    scope: String(formData.get("scope") ?? ""),
    providerRoleId: String(formData.get("providerRoleId") ?? ""),
    bucketName: String(formData.get("bucketName") ?? ""),
    providerConnectionId: String(formData.get("providerConnectionId") ?? ""),
    prefix: String(formData.get("prefix") ?? ""),
  };

  const result = shareFolderSchema.safeParse(rawData);
  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors, status: "error" as const };
  }
  const data = result.data;

  // Authoritative intra-org grant boundary: authorize the submitted scope before
  // any provider-role resolution or write session. Throws a 403 Response.
  assertGrantScope(data.scope, user.adminScopes);

  // Validate the referenced provider connection + role and reject unknown ids, a
  // role that does not permit sharing, or one not covering the submitted scope.
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
  const refs = validateProviderRefs(catalog, data, { requireSharing: true });
  if (!refs.ok) {
    return { errors: refs.errors, status: "error" as const };
  }

  try {
    const share = await createConnection(user.organization, data.scope, user.sub, {
      name: data.name,
      bucketName: data.bucketName,
      providerConnectionId: data.providerConnectionId,
      providerRoleId: data.providerRoleId,
      prefix: data.prefix,
    });

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

    return redirect(`/connections/${encodeURIComponent(data.name)}`, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];
      if (target.includes("name")) {
        return {
          errors: { name: ["A share with this name already exists. Choose another."] },
          status: "error" as const,
        };
      }
      return {
        formError: "This folder already has a connection. Edit that connection instead.",
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
