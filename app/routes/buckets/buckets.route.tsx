import { Credentials } from "@aws-sdk/client-sts";
import { ButtonLink, EmptyState } from "@cytario/design";
import { ArrowRight, FileSearch } from "lucide-react";
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
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { StorageConnectionsGrid } from "~/components/StorageConnectionsGrid";
import { loadBucketNodes } from "~/routes/buckets/loadBucketNodes";
import { deleteBucketConfig } from "~/utils/bucketConfig";
import { select, useConnectionsStore } from "~/utils/connectionsStore";
import { getFileType, IMAGE_FILE_TYPES } from "~/utils/fileType";
import { usePinnedPathsStore } from "~/utils/pinnedPathsStore";
import { useRecentlyViewedStore } from "~/utils/recentlyViewedStore/useRecentlyViewedStore";

const title = "Storage Connections";

const MAX_RECENT_IMAGES = 4;
const MAX_PINNED = 10;
const MAX_RECENT_DIRS = 5;
const MAX_RECENT_FILES = 6;
const MAX_CONNECTIONS = 100;

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

function ShowAllLink({
  href,
  total,
  maxItems,
}: {
  href: string;
  total: number;
  maxItems: number;
}) {
  return (
    <ButtonLink href={href} variant="secondary">
      {total > maxItems ? `Show all (${total})` : "View all"}
      <ArrowRight size={16} />
    </ButtonLink>
  );
}

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
        (n) => n.type === "file" && IMAGE_FILE_TYPES.has(getFileType(n.name)),
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
        (n) => n.type === "file" && !IMAGE_FILE_TYPES.has(getFileType(n.name)),
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
        _Object:
          pin.totalSize != null || pin.lastModified != null
            ? ({
                Size: pin.totalSize,
                LastModified: pin.lastModified
                  ? new Date(pin.lastModified)
                  : undefined,
              } as TreeNode["_Object"])
            : undefined,
      })),
    [pinnedItems],
  );

  return (
    <>
      {recentImages.length > 0 && (
        <DirectoryView
          viewMode="grid-lg"
          nodes={recentImages.slice(0, MAX_RECENT_IMAGES)}
          name="Recently Viewed"
          bucketName=""
        >
          <ShowAllLink
            href="/recent"
            total={recentImages.length}
            maxItems={MAX_RECENT_IMAGES}
          />
        </DirectoryView>
      )}

      {pinnedNodes.length > 0 && (
        <DirectoryView
          viewMode="list"
          nodes={pinnedNodes.slice(0, MAX_PINNED)}
          name="Pinned"
          bucketName=""
        />
      )}

      {recentDirs.length > 0 && (
        <DirectoryView
          viewMode="list"
          nodes={recentDirs.slice(0, MAX_RECENT_DIRS)}
          name="Recently Browsed"
          bucketName=""
        >
          <ShowAllLink
            href="/recent"
            total={recentDirs.length}
            maxItems={MAX_RECENT_DIRS}
          />
        </DirectoryView>
      )}

      {recentFiles.length > 0 && (
        <DirectoryView
          viewMode="grid-sm"
          nodes={recentFiles.slice(0, MAX_RECENT_FILES)}
          name="Recent Files"
          bucketName=""
        >
          <ShowAllLink
            href="/recent"
            total={recentFiles.length}
            maxItems={MAX_RECENT_FILES}
          />
        </DirectoryView>
      )}

      {nodes.length > 0 && (
        <StorageConnectionsGrid
          nodes={nodes.slice(0, MAX_CONNECTIONS)}
          bucketConfigs={bucketConfigs}
          name={title}
        >
          <ShowAllLink
            href="/buckets"
            total={nodes.length}
            maxItems={MAX_CONNECTIONS}
          />
        </StorageConnectionsGrid>
      )}

      {nodes.length === 0 && (
        <Section>
          <EmptyState
            icon={FileSearch}
            title="Start exploring your data"
            description="Add a storage connection to view your cloud storage."
            action={
              <ButtonLink href="/connect-bucket" size="lg" variant="neutral">
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
