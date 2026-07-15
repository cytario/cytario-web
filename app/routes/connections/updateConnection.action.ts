import { type ActionFunctionArgs, redirect } from "react-router";

import { connectionSchema } from "./connection.schema";
import {
  applyBucketGrantSet,
  applyGrantsAndRecordStatus,
  validateProviderRefs,
} from "./connectionGrant.server";
import { Prisma } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { prisma } from "~/.server/db/prisma";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { canCreate, canModify, canSee } from "~/utils/authorization";

export interface UpdateConnectionInput {
  name: string;
  scope: string;
  bucketName: string;
  prefix: string;
  providerConnectionId: string;
  providerRoleId: string;
}

export async function updateConnection(
  user: UserProfile,
  originalName: string,
  updates: UpdateConnectionInput,
) {
  if (!user.organization) {
    throw new Error("Active organization missing from session");
  }

  const config = await prisma.connectionConfig.findFirst({
    where: { name: originalName, organization: user.organization },
  });

  if (!config || !canSee(user, config)) {
    throw new Error("Connection not found");
  }

  if (!canModify(user, config)) {
    throw new Error("Not authorized to modify this connection");
  }

  if (updates.scope !== config.scope) {
    if (!canCreate(user, { organization: user.organization, ownerScope: updates.scope })) {
      throw new Error("Not authorized to assign to this scope");
    }
  }

  const previousName = config.name;
  const previousBucketName = config.bucketName;
  const previousProviderConnectionId = config.providerConnectionId;
  const previousProviderRoleId = config.providerRoleId;

  // FKs on recentlyViewed / pinnedPath use ON UPDATE CASCADE.
  const updated = await prisma.connectionConfig.update({
    where: { id: config.id },
    data: {
      name: updates.name,
      scope: updates.scope,
      bucketName: updates.bucketName,
      prefix: updates.prefix,
      providerConnectionId: updates.providerConnectionId,
      providerRoleId: updates.providerRoleId,
    },
  });

  return {
    ...updated,
    previousName,
    previousBucketName,
    previousProviderConnectionId,
    previousProviderRoleId,
  };
}

export const updateAction = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);
  const session = context.get(sessionContext);
  const formData = await request.formData();

  const originalName = String(formData.get("_originalName") ?? "");

  if (!originalName) {
    return { errors: { name: ["Original connection name is required"] }, status: "error" as const };
  }

  if (!user.organization) {
    return { formError: "Active organization missing from session", status: "error" as const };
  }

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
  const validated = result.data;

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
  const refs = validateProviderRefs(catalog, validated, { userSub: user.sub });
  if (!refs.ok) {
    return { errors: refs.errors, status: "error" as const };
  }

  try {
    const updatedConfig = await updateConnection(user, originalName, {
      name: validated.name,
      scope: validated.scope,
      bucketName: validated.bucketName,
      prefix: validated.prefix,
      providerConnectionId: validated.providerConnectionId,
      providerRoleId: validated.providerRoleId,
    });

    // Drop cached credentials so authMiddleware re-mints under the new identity.
    const credentials = session.get("credentials") ?? {};
    delete credentials[updatedConfig.previousName];
    if (updatedConfig.name !== updatedConfig.previousName) {
      delete credentials[updatedConfig.name];
    }
    session.set("credentials", credentials);

    const acting = {
      user,
      idToken: session.get("authTokens")?.idToken ?? "",
      accessToken: session.get("authTokens")?.accessToken ?? "",
    };

    // Re-apply the bucket-policy grant set; a scope/role edit may change the grant.
    const outcome = await applyGrantsAndRecordStatus(updatedConfig, acting);

    // A bucket/provider move strands this connection's managed statement on the
    // OLD bucket — re-apply that bucket's remaining grant set (under the pre-move
    // provider role) so the moved connection's grant is revoked there.
    const bucketMoved =
      updatedConfig.previousBucketName !== updatedConfig.bucketName ||
      updatedConfig.previousProviderConnectionId !== updatedConfig.providerConnectionId;
    let revokeWarning: string | undefined;
    if (bucketMoved) {
      const oldBucketOutcome = await applyBucketGrantSet(
        {
          organization: user.organization,
          providerConnectionId: updatedConfig.previousProviderConnectionId,
          bucketName: updatedConfig.previousBucketName,
        },
        {
          ...updatedConfig,
          bucketName: updatedConfig.previousBucketName,
          providerConnectionId: updatedConfig.previousProviderConnectionId,
          providerRoleId: updatedConfig.previousProviderRoleId,
        },
        acting,
      );
      if (oldBucketOutcome.status !== "applied") {
        revokeWarning = `The previous bucket's grant could not be revoked. ${oldBucketOutcome.warning}`;
      }
    }

    const applied = outcome.status === "applied" && !revokeWarning;
    session.set("notification", {
      status: applied ? "success" : "warning",
      message: applied
        ? "Connection updated successfully."
        : `Connection updated. ${[
            outcome.status === "applied" ? undefined : outcome.warning,
            revokeWarning,
          ]
            .filter(Boolean)
            .join(" ")}`,
    });

    return redirect(`/connections/${encodeURIComponent(updatedConfig.name)}`, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        errors: {
          name: [
            "This name is already taken, or a connection to this bucket already exists under that scope.",
          ],
        },
        status: "error" as const,
      };
    }

    if (error instanceof Error) {
      return { formError: error.message, status: "error" as const };
    }

    throw error;
  }
};
