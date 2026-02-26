import { Credentials } from "@aws-sdk/client-sts";
import { useEffect, useMemo } from "react";
import {
  ActionFunction,
  type LoaderFunction,
  type MetaFunction,
  type ShouldRevalidateFunction,
  Outlet,
  redirect,
} from "react-router";
import { useLoaderData } from "react-router";

import { BucketConfig } from "~/.generated/client";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { Section } from "~/components/Container";
import { ButtonLink } from "~/components/Controls";
import { DashboardSection } from "~/components/DashboardSection";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { Placeholder } from "~/components/Placeholder";
import { loadBucketNodes } from "~/routes/buckets/loadBucketNodes";
import { deleteBucketConfig } from "~/utils/bucketConfig";
import { select, useConnectionsStore } from "~/utils/connectionsStore";
import { getFileType } from "~/utils/fileType";
import { usePinnedPathsStore } from "~/utils/pinnedPathsStore";
import { useRecentlyViewedStore } from "~/utils/recentlyViewedStore/useRecentlyViewedStore";

const title = "Storage Connections";
const IMAGE_TYPES = new Set(["TIFF", "OME-TIFF", "PNG", "JPEG"]);

export const meta: MetaFunction = () => {
  return [
    { title },
    { name: "description", content: "Manage your storage connections" },
  ];
};

export const shouldRevalidate: ShouldRevalidateFunction = ({
  formAction,
  defaultShouldRevalidate,
}) => {
  if (formAction) return defaultShouldRevalidate;
  return false;
};

export const middleware = [authMiddleware];

export const loader: LoaderFunction = async ({ context }) => {
  return loadBucketNodes(context);
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
  const { nodes, adminScopes, userId, credentials, bucketConfigs } =
    useLoaderData<{
      nodes: TreeNode[];
      adminScopes: string[];
      userId: string;
      credentials: Record<string, Credentials>;
      bucketConfigs: BucketConfig[];
    }>();

  const setConnection = useConnectionsStore(select.setConnection);

  useEffect(() => {
    for (const config of bucketConfigs) {
      const creds = credentials[config.name];
      if (creds) {
        setConnection(`${config.provider}/${config.name}`, creds, config);
      }
    }
  }, [credentials, bucketConfigs, setConnection]);

  const allRecentItems = useRecentlyViewedStore((state) => state.items);
  const pinnedItems = usePinnedPathsStore((state) => state.items);

  const recentImages = useMemo(
    () =>
      allRecentItems.filter(
        (n) => n.type === "file" && IMAGE_TYPES.has(getFileType(n.name)),
      ),
    [allRecentItems],
  );

  const recentDirs = useMemo(
    () => allRecentItems.filter((n) => n.type === "directory"),
    [allRecentItems],
  );

  const recentFiles = useMemo(
    () =>
      allRecentItems.filter(
        (n) => n.type === "file" && !IMAGE_TYPES.has(getFileType(n.name)),
      ),
    [allRecentItems],
  );

  const pinnedNodes: TreeNode[] = useMemo(
    () =>
      pinnedItems.map((pin) => ({
        provider: pin.provider,
        bucketName: pin.bucketName,
        pathName: pin.pathName,
        name: pin.displayName,
        type: "directory" as const,
        children: [],
      })),
    [pinnedItems],
  );

  return (
    <>
      <DashboardSection
        title="Recently Viewed"
        nodes={recentImages}
        viewMode="grid-lg"
        maxItems={4}
        showAllHref="/recent?filter=images"
      />
      <DashboardSection
        title="Pinned"
        nodes={pinnedNodes}
        viewMode="list"
        maxItems={10}
      />
      <DashboardSection
        title="Recently Browsed"
        nodes={recentDirs}
        viewMode="list"
        maxItems={5}
        showAllHref="/recent?filter=directories"
      />
      <DashboardSection
        title="Recent Files"
        nodes={recentFiles}
        viewMode="grid-sm"
        maxItems={6}
        showAllHref="/recent?filter=files"
      />

      <DashboardSection
        title={title}
        nodes={nodes}
        viewMode="grid-md"
        maxItems={100}
        showAllHref="/buckets"
      />

      {nodes.length === 0 && (
        <Section>
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
        </Section>
      )}

      <Outlet context={{ adminScopes, userId }} />
    </>
  );
}
