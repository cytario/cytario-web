import { BucketConfig } from "@prisma/client";
import {
  ActionFunction,
  type LoaderFunction,
  type MetaFunction,
  Outlet,
  redirect,
} from "react-router";
import { useLoaderData } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { Container } from "~/components/Container";
import { ButtonLink } from "~/components/Controls/Button";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import DirectoryView from "~/components/DirectoryView/DirectoryView";
import { Placeholder } from "~/components/Placeholder";
import {
  getBucketConfigsForUser,
  deleteBucketConfig,
} from "~/utils/bucketConfig";

const title = "Configured Buckets";

export const meta: MetaFunction = () => {
  return [
    { title },
    { name: "description", content: "Manage your configured buckets" },
  ];
};

export const middleware = [authMiddleware];

export const loader: LoaderFunction = async ({ context }) => {
  const { user } = context.get(authContext);
  const { sub: userId } = user;

  const bucketConfigs = await getBucketConfigsForUser(userId);

  return { bucketConfigs };
};

export const action: ActionFunction = async ({ request, context }) => {
  const { user } = context.get(authContext);
  const { sub: userId } = user;

  if (request.method.toLowerCase() === "delete") {
    const formData = await request.formData();
    const provider = formData.get("provider") as string;
    const bucketName = formData.get("bucketName") as string;

    if (!provider) {
      return { error: "Provider is required" };
    }

    if (!bucketName) {
      return { error: "Bucket name is required" };
    }

    await deleteBucketConfig(userId, provider, bucketName);

    const session = await getSession(request);

    session.set("notification", {
      status: "success",
      message: "Bucket connection deleted.",
    });

    return redirect("/", {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  }

  return null;
};

export default function BucketsRoute() {
  const { bucketConfigs } = useLoaderData<{ bucketConfigs: BucketConfig[] }>();

  const nodes: TreeNode[] = bucketConfigs.map((bucketConfig) => ({
    bucketName: bucketConfig.name,
    name: bucketConfig.name,
    type: "bucket",
    children: [],
    _Bucket: bucketConfig,
  }));

  return (
    <>
      {bucketConfigs.length > 0 ? (
        <DirectoryView name={title} nodes={nodes} bucketName="" />
      ) : (
        <Container>
          <Placeholder
            icon="FileSearch"
            title="Start exploring your data"
            description="Connect a cloud bucket or open a local file."
            cta={
              <>
                <ButtonLink to="/connect-bucket" scale="large" theme="primary">
                  Connect Bucket
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
