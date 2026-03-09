import {
  type ActionFunctionArgs,
  type MetaFunction,
  redirect,
  useOutletContext,
} from "react-router";

import { Prisma } from "~/.generated/client";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { canCreate } from "~/.server/auth/authorization";
import { getSession } from "~/.server/auth/getSession";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { useBackendNotification } from "~/components/Notification/Notification.store";
import { RouteModal } from "~/components/RouteModal";
import { AddConnectionForm } from "~/forms/addConnection/addConnection.form";
import {
  connectBucketSchema,
  parseS3Uri,
} from "~/forms/addConnection/addConnection.schema";
import { upsertConnectionConfig } from "~/utils/connectionConfig.server";

const title = "Connect Storage";

export const meta: MetaFunction = () => {
  return [{ title }];
};

export const handle = {
  breadcrumb: () => ({ label: title, to: "/connect-bucket" }),
};

export const middleware = [authMiddleware];

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);

  const formData = await request.formData();

  const rawData = {
    alias: String(formData.get("alias") ?? ""),
    ownerScope: String(formData.get("ownerScope") ?? ""),
    providerType: String(formData.get("providerType") ?? ""),
    provider: String(formData.get("provider") ?? ""),
    s3Uri: String(formData.get("s3Uri") ?? ""),
    bucketRegion: String(formData.get("bucketRegion") ?? ""),
    roleArn: String(formData.get("roleArn") ?? ""),
    bucketEndpoint: String(formData.get("bucketEndpoint") ?? ""),
  };

  const result = connectBucketSchema.safeParse(rawData);

  if (!result.success) {
    return {
      errors: result.error.flatten().fieldErrors,
      status: "error",
    };
  }

  const data = result.data;

  if (!canCreate(user, data.ownerScope)) {
    return {
      errors: { ownerScope: ["Not authorized to create in this scope"] },
      status: "error",
    };
  }

  const { bucketName, prefix } = parseS3Uri(data.s3Uri);
  const session = await getSession(request);

  try {
    const provider = data.providerType === "aws" ? "aws" : data.provider;
    const endpoint =
      data.providerType === "aws"
        ? `https://s3.${data.bucketRegion}.amazonaws.com`
        : data.bucketEndpoint;

    const newConfig = {
      alias: data.alias,
      name: bucketName,
      provider,
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

    return redirect(`/connections/${data.alias}`, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  } catch (error) {
    // Handle unique constraint violation on alias
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: {
          alias: ["This alias is already taken. Please choose another."],
        },
        status: "error",
      };
    }

    console.error("Error upserting bucket config:", error);

    session.set("notification", {
      status: "error",
      message: "Error connecting bucket.",
    });

    return redirect(`/`, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  }
};

export default function ConnectBucketModal() {
  const { adminScopes, userId } = useOutletContext<{
    adminScopes: string[];
    userId: string;
  }>();
  useBackendNotification();

  return (
    <RouteModal title={title}>
      <AddConnectionForm adminScopes={adminScopes} userId={userId} />
    </RouteModal>
  );
}
