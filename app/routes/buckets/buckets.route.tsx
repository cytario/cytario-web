import { useEffect } from "react";
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
import { getSession } from "~/.server/auth/getSession";
import { SessionCredentials, sessionStorage } from "~/.server/auth/sessionStorage";
import { Container } from "~/components/Container";
import { ButtonLink } from "~/components/Controls";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { Placeholder } from "~/components/Placeholder";
import { deleteBucketConfig } from "~/utils/bucketConfig";
import { useCredentialsStore } from "~/utils/credentialsStore/useCredentialsStore";

const title = "Your Storage Connections";

export const meta: MetaFunction = () => {
  return [
    { title },
    { name: "description", content: "Manage your storage connections" },
  ];
};

export const middleware = [authMiddleware];

export const loader: LoaderFunction = async ({ context }) => {
  const { bucketConfigs, credentials } = context.get(authContext);

  return { bucketConfigs, credentials };
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

interface BucketsLoaderResponse {
  bucketConfigs: BucketConfig[];
  credentials: SessionCredentials;
}

export default function BucketsRoute() {
  const { bucketConfigs, credentials } =
    useLoaderData<BucketsLoaderResponse>();
  const { setCredentials } = useCredentialsStore();

  // Hydrate credentials store with all bucket configs and credentials on init
  useEffect(() => {
    if (!bucketConfigs || !credentials) return;

    for (const config of bucketConfigs) {
      const creds = credentials[config.name];
      if (creds) {
        const storeKey = `${config.provider}/${config.name}`;
        setCredentials(storeKey, creds, config);
      }
    }
  }, [bucketConfigs, credentials, setCredentials]);

  const nodes: TreeNode[] = bucketConfigs.map((bucketConfig) => {
    // Display name: bucket name or bucket/lastPrefixSegment if prefix exists
    const prefixLastSegment = bucketConfig.prefix
      ?.replace(/\/$/, "")
      .split("/")
      .pop();
    const displayName = bucketConfig.prefix
      ? `${bucketConfig.name}/${prefixLastSegment}`
      : bucketConfig.name;

    return {
      bucketName: bucketConfig.name,
      name: displayName,
      type: "bucket",
      provider: bucketConfig.provider,
      pathName: bucketConfig.prefix || undefined,
      children: [],
    };
  });

  return (
    <>
      {bucketConfigs.length > 0 ? (
        <DirectoryView name={title} nodes={nodes} bucketName="" />
      ) : (
        <Container>
          <Placeholder
            icon="FileSearch"
            title="Start exploring your data"
            description="Add a storage connection to view your cloud storage."
            cta={
              <>
                <ButtonLink to="/connect-bucket" scale="large" theme="primary">
                  Connect Storage
                </ButtonLink>
                {/* <Button disabled scale="large">
                  Open Local File
                </Button> */}
              </>
            }
          />
        </Container>
      )}

      {/* Renders Modal Routes */}
      <Outlet />
    </>
  );
}
