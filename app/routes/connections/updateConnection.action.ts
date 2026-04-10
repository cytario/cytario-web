import { type ActionFunctionArgs, redirect } from "react-router";

import { connectionSchema, parseS3Uri } from "./connection.schema";
import { Prisma } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { invalidateS3ClientsForBucket } from "~/.server/auth/getS3Client";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { prisma } from "~/.server/db/prisma";
import { canCreate, canModify, canSee } from "~/utils/authorization";

/** Update a connection config. Cascades name changes to related records. */
export async function updateConnection(
  user: UserProfile,
  originalName: string,
  updates: {
    name: string;
    ownerScope: string;
    provider: string;
    bucketName: string;
    prefix: string;
    endpoint: string;
    roleArn: string | null;
    region: string | null;
  },
) {
  const config = await prisma.connectionConfig.findUnique({
    where: { name: originalName },
  });

  if (!config || !canSee(user, config.ownerScope)) {
    throw new Error("Connection not found");
  }

  if (!canModify(user, config.ownerScope)) {
    throw new Error("Not authorized to modify this connection");
  }

  if (updates.ownerScope !== config.ownerScope) {
    if (!canCreate(user, updates.ownerScope)) {
      throw new Error("Not authorized to assign to this scope");
    }
  }

  const previousBucketName = config.bucketName;

  // FKs on recentlyViewed/pinnedPath have ON UPDATE CASCADE,
  // so Postgres automatically cascades name changes to children.
  const updated = await prisma.connectionConfig.update({
    where: { id: config.id },
    data: {
      name: updates.name,
      ownerScope: updates.ownerScope,
      provider: updates.provider,
      bucketName: updates.bucketName,
      prefix: updates.prefix,
      endpoint: updates.endpoint,
      roleArn: updates.roleArn,
      region: updates.region,
    },
  });

  return { ...updated, previousBucketName };
}

export const updateAction = async ({
  request,
  context,
}: ActionFunctionArgs) => {
  const { user } = context.get(authContext);
  const session = context.get(sessionContext);
  const formData = await request.formData();

  const originalName = String(formData.get("_originalName") ?? "");

  if (!originalName) {
    return {
      errors: { name: ["Original connection name is required"] },
      status: "error" as const,
    };
  }

  // Validate the form data with the same schema as create
  const rawData = {
    name: String(formData.get("name") ?? ""),
    ownerScope: String(formData.get("ownerScope") ?? ""),
    providerType: String(formData.get("providerType") ?? ""),
    s3Uri: String(formData.get("s3Uri") ?? ""),
    bucketRegion: String(formData.get("bucketRegion") ?? ""),
    roleArn: String(formData.get("roleArn") ?? ""),
    bucketEndpoint: String(formData.get("bucketEndpoint") ?? ""),
  };

  const result = connectionSchema.safeParse(rawData);

  if (!result.success) {
    return {
      errors: result.error.flatten().fieldErrors,
      status: "error" as const,
    };
  }

  const validated = result.data;
  const { bucketName, prefix } = parseS3Uri(validated.s3Uri);

  const endpoint =
    validated.providerType === "aws"
      ? `https://s3.${validated.bucketRegion}.amazonaws.com`
      : validated.bucketEndpoint;

  try {
    const updatedConfig = await updateConnection(user, originalName, {
      name: validated.name,
      ownerScope: validated.ownerScope,
      provider: validated.providerType,
      bucketName,
      prefix,
      endpoint,
      roleArn: validated.providerType === "aws" ? validated.roleArn : null,
      region: validated.providerType === "aws" ? validated.bucketRegion : null,
    });

    // Invalidate cached credentials and S3 clients for the old bucket
    const credentials = session.get("credentials") ?? {};
    delete credentials[updatedConfig.previousBucketName];
    if (updatedConfig.bucketName !== updatedConfig.previousBucketName) {
      delete credentials[updatedConfig.bucketName];
    }
    session.set("credentials", credentials);
    invalidateS3ClientsForBucket(user.sub, updatedConfig.previousBucketName);

    session.set("notification", {
      status: "success",
      message: "Connection updated successfully.",
    });

    return redirect(`/connections/${encodeURIComponent(updatedConfig.name)}`, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
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
      return {
        errors: { ownerScope: [error.message] },
        status: "error" as const,
      };
    }

    throw error;
  }
};
