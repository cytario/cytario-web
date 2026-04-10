import { type ActionFunctionArgs, redirect } from "react-router";

import { connectionSchema, parseS3Uri } from "./connection.schema";
import { Prisma } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { prisma } from "~/.server/db/prisma";
import { canCreate } from "~/utils/authorization";

/** Create a connection config (upserts on the composite unique key). */
export async function createConnection(
  ownerScope: string,
  createdBy: string,
  config: {
    name: string;
    bucketName: string;
    provider: string;
    roleArn: string | null;
    region: string | null;
    endpoint: string;
    prefix?: string;
  },
) {
  const prefix = config.prefix ?? "";
  return prisma.connectionConfig.upsert({
    where: {
      ownerScope_provider_bucketName_prefix: {
        ownerScope,
        provider: config.provider,
        bucketName: config.bucketName,
        prefix,
      },
    },
    update: { ...config, prefix },
    create: {
      ownerScope,
      createdBy,
      ...config,
      prefix,
    },
  });
}

export const createAction = async ({
  request,
  context,
}: ActionFunctionArgs) => {
  const { user } = context.get(authContext);

  const formData = await request.formData();

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

  const data = result.data;

  if (!canCreate(user, data.ownerScope)) {
    return {
      errors: { ownerScope: ["Not authorized to create in this scope"] },
      status: "error" as const,
    };
  }

  const { bucketName, prefix } = parseS3Uri(data.s3Uri);
  const session = context.get(sessionContext);

  try {
    const endpoint =
      data.providerType === "aws"
        ? `https://s3.${data.bucketRegion}.amazonaws.com`
        : data.bucketEndpoint;

    const newConfig = {
      name: data.name,
      bucketName,
      provider: data.providerType,
      roleArn: data.providerType === "aws" ? data.roleArn : null,
      region: data.providerType === "aws" ? data.bucketRegion : null,
      endpoint,
      prefix,
    };

    await createConnection(data.ownerScope, user.sub, newConfig);

    session.set("notification", {
      status: "success",
      message: "Storage connection added successfully.",
    });

    return redirect(`/connections/${encodeURIComponent(data.name)}`, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: {
          name: ["This name is already taken. Please choose another."],
        },
        status: "error" as const,
      };
    }

    console.error("Error creating connection:", error);

    session.set("notification", {
      status: "error",
      message: "Error adding connection.",
    });

    return redirect(`/`, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  }
};
