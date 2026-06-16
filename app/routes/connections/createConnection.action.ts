import { type ActionFunctionArgs, redirect } from "react-router";

import { connectionSchema, parseS3Uri } from "./connection.schema";
import { Prisma } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { describeCorsFailure, describeCorsWarning, probeBucketCors } from "~/.server/corsPreflight";
import { prisma } from "~/.server/db/prisma";
import { cytarioConfig } from "~/config";
import { canCreate } from "~/utils/authorization";
import { constructS3Url } from "~/utils/resourceId";

export async function createConnection(
  organization: string,
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
      organization_provider_bucketName_prefix: {
        organization,
        provider: config.provider,
        bucketName: config.bucketName,
        prefix,
      },
    },
    update: { ...config, ownerScope, prefix },
    create: {
      organization,
      ownerScope,
      createdBy,
      ...config,
      prefix,
    },
  });
}

export const createAction = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);
  if (!user.organization) {
    throw new Error("Active organization missing from session");
  }

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

  if (!canCreate(user, { organization: user.organization, ownerScope: data.ownerScope })) {
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

    // Surface CORS misconfigurations at submit time rather than at first
    // browser-side fetch (where they read as a generic "Failed to fetch").
    const cytarioOrigin = cytarioConfig.endpoints.webapp;
    const bucketUrl = constructS3Url({
      bucketName,
      region: data.providerType === "aws" ? data.bucketRegion : null,
      endpoint,
    });
    const corsResult = await probeBucketCors(bucketUrl, cytarioOrigin);
    if (!corsResult.ok) {
      // CORS / allowlist failures span multiple fields (and AWS has no
      // endpoint field) — surface as a form-level banner.
      return {
        formError: describeCorsFailure(corsResult, cytarioOrigin),
        status: "error" as const,
      };
    }

    const newConfig = {
      name: data.name,
      bucketName,
      provider: data.providerType,
      roleArn: data.providerType === "aws" ? data.roleArn : null,
      region: data.providerType === "aws" ? data.bucketRegion : null,
      endpoint,
      prefix,
    };

    await createConnection(user.organization, data.ownerScope, user.sub, newConfig);

    if (corsResult.warnings.length > 0) {
      session.set("notification", {
        status: "warning",
        message: `Connection added. ${corsResult.warnings
          .map((w) => describeCorsWarning(w, cytarioOrigin))
          .join(" ")}`,
      });
    } else {
      session.set("notification", {
        status: "success",
        message: "Connection added successfully.",
      });
    }

    return redirect(`/connections/${encodeURIComponent(data.name)}`, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        errors: {
          name: ["This name is already taken. Please choose another."],
        },
        status: "error" as const,
      };
    }

    console.error("Error creating connection:", error);

    // Keep the wizard mounted so the user's draft survives the error.
    return {
      formError: "Could not add the connection. Try again or check the server logs.",
      status: "error" as const,
    };
  }
};
