import {
  ActionFunction,
  type LoaderFunction,
  type MetaFunction,
  Outlet,
  redirect,
} from "react-router";
import { useLoaderData } from "react-router";

import { BucketConfig } from "~/.generated/client";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getPresignedUrl } from "~/.server/auth/getPresignedUrl";
import { getS3Client } from "~/.server/auth/getS3Client";
import { getSession } from "~/.server/auth/getSession";
import { SessionCredentials, sessionStorage } from "~/.server/auth/sessionStorage";
import { ClientOnly } from "~/components/ClientOnly";
import { Section } from "~/components/Container";
import { ButtonLink } from "~/components/Controls";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { Placeholder } from "~/components/Placeholder";
import { RecentlyViewed } from "~/components/RecentlyViewed/RecentlyViewed";
import { ObjectPresignedUrl } from "~/routes/objects.route";
import { deleteBucketConfig } from "~/utils/bucketConfig";
import { getObjects } from "~/utils/getObjects";

const title = "Your Storage Connections";

export const meta: MetaFunction = () => {
  return [
    { title },
    { name: "description", content: "Manage your storage connections" },
  ];
};

export const middleware = [authMiddleware];

const fetchPreviewObject = async (
  config: BucketConfig,
  credentials: SessionCredentials,
  userId: string,
): Promise<ObjectPresignedUrl | undefined> => {
  const creds = credentials[config.name];
  if (!creds) return undefined;
  const s3 = await getS3Client(config, creds, userId);
  const objects = await getObjects(
    config,
    s3,
    null,
    config.prefix || undefined,
    100,
  );
  const preview = objects.find((obj) => obj.Key?.endsWith(".ome.tif"));
  if (!preview?.Key) return undefined;
  const presignedUrl = await getPresignedUrl(config, s3, preview.Key);
  return { ...preview, presignedUrl } as ObjectPresignedUrl;
};

export const loader: LoaderFunction = async ({ context }) => {
  const { bucketConfigs, credentials, user } = context.get(authContext);
  const userId = user.sub;

  const previews = await Promise.allSettled(
    bucketConfigs.map((config) =>
      fetchPreviewObject(config, credentials, userId),
    ),
  );

  const nodes: TreeNode[] = bucketConfigs.map((config, i) => {
    const result = previews[i];
    const previewObj = result.status === "fulfilled" ? result.value : undefined;

    const prefixLastSegment = config.prefix
      ?.replace(/\/$/, "")
      .split("/")
      .pop();
    const displayName = config.prefix
      ? `${config.name}/${prefixLastSegment}`
      : config.name;

    return {
      bucketName: config.name,
      name: displayName,
      type: "bucket" as const,
      provider: config.provider,
      pathName: config.prefix || undefined,
      children: [],
      _Object: previewObj,
    };
  });

  return { nodes };
};

export const action: ActionFunction = async ({ request, context }) => {
  const { user } = context.get(authContext);

  if (request.method.toLowerCase() === "delete") {
    const formData = await request.formData();
    const provider = formData.get("provider") as string;
    const bucketName = formData.get("bucketName") as string;
    const prefix = (formData.get("prefix") as string) ?? "";

    if (!provider) {
      return { error: "Provider is required" };
    }

    if (!bucketName) {
      return { error: "Bucket name is required" };
    }

    await deleteBucketConfig(user, provider, bucketName, prefix);

    const session = await getSession(request);

    session.set("notification", {
      status: "success",
      message: "Storage connection deleted.",
    });

    return redirect("/", {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  }

  return null;
};

export default function BucketsRoute() {
  const { nodes } = useLoaderData<{ nodes: TreeNode[] }>();

  return (
    <>
      <Section>
        {nodes.length > 0 ? (
          <DirectoryView nodes={nodes} name={title} bucketName="" />
        ) : (
          <Placeholder
            icon="FileSearch"
            title="Start exploring your data"
            description="Add a storage connection to view your cloud storage."
            cta={
              <ButtonLink to="/connect-bucket" scale="large" theme="primary">
                Connect Storage
              </ButtonLink>
            }
          />
        )}
      </Section>

      <ClientOnly>
        <RecentlyViewed />
      </ClientOnly>

      <Outlet />
    </>
  );
}
