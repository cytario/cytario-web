import { type ActionFunction, type MetaFunction, redirect } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { BreadcrumbLink } from "~/components/Breadcrumbs/BreadcrumbLink";
import { RouteModal } from "~/components/RouteModal";
import { ConnectBucketForm } from "~/forms/connectBucket/connectBucket.form";
import {
  connectBucketSchema,
  parseS3Uri,
} from "~/forms/connectBucket/connectBucket.schema";
import { upsertBucketConfig } from "~/utils/bucketConfig";

const title = "Connect Storage";

export const meta: MetaFunction = () => {
  return [{ title }];
};

export const handle = {
  breadcrumb: () => (
    <BreadcrumbLink key="connect-bucket" to={`/connect-bucket`}>
      {title}
    </BreadcrumbLink>
  ),
};

export const middleware = [authMiddleware];

export const action: ActionFunction = async ({ request, context }) => {
  const { user } = context.get(authContext);
  const { sub: userId } = user;

  const formData = await request.formData();

  const rawData = {
    providerType: formData.get("providerType") as string,
    provider: formData.get("provider") as string,
    s3Uri: formData.get("s3Uri") as string,
    bucketRegion: formData.get("bucketRegion") as string,
    roleArn: formData.get("roleArn") as string,
    bucketEndpoint: formData.get("bucketEndpoint") as string,
  };

  const result = connectBucketSchema.safeParse(rawData);

  if (!result.success) {
    return {
      errors: result.error.flatten().fieldErrors,
      status: "error",
    };
  }

  const data = result.data;
  const { bucketName, prefix } = parseS3Uri(data.s3Uri);
  const session = await getSession(request);

  try {
    const provider = data.providerType === "aws" ? "aws" : data.provider;
    const endpoint =
      data.providerType === "aws"
        ? `https://s3.${data.bucketRegion}.amazonaws.com`
        : data.bucketEndpoint;

    const newConfig = {
      name: bucketName,
      provider,
      roleArn: data.providerType === "aws" ? data.roleArn : null,
      region: data.providerType === "aws" ? data.bucketRegion : null,
      endpoint,
      prefix,
    };

    await upsertBucketConfig(userId, newConfig);

    session.set("notification", {
      status: "success",
      message: "Data connection added successfully.",
    });

    const redirectPath = prefix
      ? `/buckets/${provider}/${bucketName}/${prefix}`
      : `/buckets/${provider}/${bucketName}`;

    return redirect(redirectPath, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  } catch (error) {
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
  return (
    <RouteModal title={title}>
      <ConnectBucketForm />
    </RouteModal>
  );
}
