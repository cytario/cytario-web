import { type ActionFunctionArgs, redirect } from "react-router";

import { connectionSchema } from "./connection.schema";
import {
  applyBucketGrantSet,
  applyGrantsAndRecordStatus,
  validateBucketRef,
  validateProviderRefs,
} from "./connectionGrant.server";
import type { GrantInput } from "./createConnection.action";
import { parseGrants } from "./createConnection.action";
import { Prisma } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { prisma } from "~/.server/db/prisma";
import { getProviderCatalog } from "~/.server/providers/providerCatalog.server";
import { canCreate, canModify, canSee } from "~/utils/authorization";
import { isProbingAllowedEndpoint } from "~/utils/egressGuard";

export interface UpdateConnectionInput {
  name: string;
  bucketName: string;
  prefix: string;
  providerConnectionId: string;
  publicEndpoint: string | null;
  grants: GrantInput[];
}

/** The endpoint may be probed at all: https, or loopback http in a local env. */
function isValidPublicEndpointScheme(endpoint: string): boolean {
  return isProbingAllowedEndpoint(endpoint);
}

export async function updateConnection(
  user: UserProfile,
  connectionId: string,
  updates: UpdateConnectionInput,
) {
  if (!user.organization) {
    throw new Error("Active organization missing from session");
  }

  const config = await prisma.connectionConfig.findFirst({
    where: { id: connectionId, organization: user.organization },
    include: { grants: true },
  });

  if (!config || !canSee(user, config)) {
    throw new Error("Connection not found");
  }

  if (!canModify(user, config)) {
    throw new Error("Not authorized to modify this connection");
  }

  const existingScopes = new Set(config.grants.map((g) => g.scope));
  const submittedScopes = new Set(updates.grants.map((g) => g.scope));

  for (const grant of updates.grants) {
    if (!existingScopes.has(grant.scope)) {
      if (!canCreate(user, { organization: user.organization, ownerScope: grant.scope })) {
        throw new Error(`Not authorized to create a grant for scope "${grant.scope}"`);
      }
    }
  }
  for (const grant of config.grants) {
    if (!submittedScopes.has(grant.scope)) {
      if (!canModify(user, { organization: user.organization, ownerScope: grant.scope })) {
        throw new Error(`Not authorized to remove the grant for scope "${grant.scope}"`);
      }
    }
  }

  const previousBucketName = config.bucketName;
  const previousProviderConnectionId = config.providerConnectionId;

  // The discovered bucket region only applies to the bucket it was discovered
  // for: a different bucket, provider, or endpoint makes it stale. The update
  // path does not re-probe — the next browse follows the provider's redirect
  // again and the health probe re-surfaces any mismatch.
  const regionStillApplies =
    updates.bucketName === previousBucketName &&
    updates.providerConnectionId === previousProviderConnectionId &&
    (updates.publicEndpoint ?? null) === (config.publicEndpoint ?? null);
  const publicRegion = regionStillApplies ? config.publicRegion : null;

  const updated = await prisma.connectionConfig.update({
    where: { id: config.id },
    data: {
      name: updates.name,
      bucketName: updates.bucketName,
      prefix: updates.prefix,
      providerConnectionId: updates.providerConnectionId,
      publicEndpoint: updates.publicEndpoint,
      publicRegion,
      grants: {
        deleteMany: {},
        createMany: {
          data: updates.grants.map((g) => ({
            scope: g.scope,
            accessLevel: g.accessLevel,
          })),
        },
      },
    },
    include: { grants: true },
  });

  return {
    ...updated,
    grants: updated.grants,
    previousBucketName,
    previousProviderConnectionId,
  };
}

export const updateAction = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);
  const session = context.get(sessionContext);
  const formData = await request.formData();

  const connectionId = String(formData.get("connectionId") ?? "");

  if (!connectionId) {
    return { errors: { name: ["Connection id is required"] }, status: "error" as const };
  }

  if (!user.organization) {
    return { formError: "Active organization missing from session", status: "error" as const };
  }

  const rawData = {
    name: String(formData.get("name") ?? ""),
    providerConnectionId: String(formData.get("providerConnectionId") ?? ""),
    bucketName: String(formData.get("bucketName") ?? ""),
    prefix: String(formData.get("prefix") ?? ""),
    publicEndpoint: String(formData.get("publicEndpoint") ?? ""),
    grants: parseGrants(formData),
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
        error instanceof Error
          ? error.message
          : "The connection to the admin portal is unavailable right now.",
      status: "error" as const,
    };
  }
  const refs = validateProviderRefs(catalog, validated);
  if (!refs.ok) {
    return { errors: refs.errors, status: "error" as const };
  }

  const providerIsPublic = refs.providerConnection.isPublic;
  const publicEndpoint = providerIsPublic ? (validated.publicEndpoint ?? null) : null;
  if (publicEndpoint && !isValidPublicEndpointScheme(publicEndpoint)) {
    return {
      errors: {
        publicEndpoint: [
          "The endpoint must be an https:// URL (loopback http://localhost[:port] or http://127.0.0.1[:port] is allowed in development and test).",
        ],
      },
      status: "error" as const,
    };
  }

  const bucketRef = await validateBucketRef(
    user.organization,
    session.get("authTokens")?.accessToken ?? "",
    validated,
    refs.providerConnection,
  );
  if (!bucketRef.ok) {
    if ("formError" in bucketRef) {
      return { formError: bucketRef.formError, status: "error" as const };
    }
    return { errors: bucketRef.errors, status: "error" as const };
  }

  try {
    const updatedConfig = await updateConnection(user, connectionId, {
      name: validated.name,
      bucketName: validated.bucketName,
      prefix: validated.prefix,
      providerConnectionId: validated.providerConnectionId,
      publicEndpoint,
      grants: validated.grants,
    });

    const credentials = session.get("credentials") ?? {};
    delete credentials[updatedConfig.id];
    session.set("credentials", credentials);

    const acting = {
      user,
      idToken: session.get("authTokens")?.idToken ?? "",
      accessToken: session.get("authTokens")?.accessToken ?? "",
    };

    const outcome = await applyGrantsAndRecordStatus(updatedConfig, acting);

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

    return redirect(`/connections/${updatedConfig.id}`, {
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
        errors: {
          grants: ["Each group may appear at most once on a connection."],
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
