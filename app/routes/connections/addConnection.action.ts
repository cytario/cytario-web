import { type ActionFunctionArgs, redirect } from "react-router";

import { connectBucketSchema, parseS3Uri } from "./addConnection.schema";
import { Prisma } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { canCreate } from "~/.server/auth/authorization";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { upsertConnectionConfig } from "~/utils/connectionConfig.server";

export const addConnectionAction = async ({
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

  const result = connectBucketSchema.safeParse(rawData);

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

    await upsertConnectionConfig(data.ownerScope, user.sub, newConfig);

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

    console.error("Error upserting connection config:", error);

    session.set("notification", {
      status: "error",
      message: "Error adding connection.",
    });

    return redirect(`/`, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  }
};
