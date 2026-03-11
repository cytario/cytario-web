import {
  type ActionFunctionArgs,
  type MetaFunction,
  redirect,
  useActionData,
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
    // Handle unique constraint violation on name
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: {
          name: ["This name is already taken. Please choose another."],
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
  const actionData = useActionData<typeof action>();
  useBackendNotification();

  return (
    <RouteModal title={title}>
      <AddConnectionForm
        adminScopes={adminScopes}
        userId={userId}
        serverErrors={actionData?.status === "error" ? actionData.errors : undefined}
      />
    </RouteModal>
  );
}
