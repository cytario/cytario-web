import { Credentials } from "@aws-sdk/client-sts";
import { ButtonLink, EmptyState } from "@cytario/design";
import { ArrowRight, FileSearch } from "lucide-react";
import { useMemo } from "react";
import {
  ActionFunction,
  type LoaderFunction,
  type MetaFunction,
  type ShouldRevalidateFunction,
  Outlet,
  redirect,
} from "react-router";
import { useLoaderData } from "react-router";

import { ConnectionConfig } from "~/.generated/client";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { Section } from "~/components/Container";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { useInitConnections } from "~/hooks/useInitConnections";
import {
  loadConnectionNodes,
  type SerializedPinnedPath,
  type SerializedRecentlyViewed,
} from "~/routes/connections/loadConnectionNodes";
import { deleteConnectionConfig } from "~/utils/connectionConfig";
import { getFileType } from "~/utils/fileType";

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
  return loadConnectionNodes(context);
};

export const action: ActionFunction = async ({ request, context }) => {
  const { user } = context.get(authContext);

  if (request.method.toLowerCase() === "delete") {
    const formData = await request.formData();
    const alias = formData.get("alias") as string;

    if (!alias) {
      return { error: "Connection alias is required" };
    }

    await deleteConnectionConfig(user, alias);

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

export default function ConnectionsRoute() {
  const {
    nodes,
    adminScopes,
    userId,
    credentials,
    connectionConfigs,
    recentlyViewed,
    pinnedPaths,
  } = useLoaderData<{
    nodes: TreeNode[];
    adminScopes: string[];
    userId: string;
    credentials: Record<string, Credentials>;
    connectionConfigs: ConnectionConfig[];
    recentlyViewed: SerializedRecentlyViewed[];
    pinnedPaths: SerializedPinnedPath[];
  }>();

  useInitConnections(connectionConfigs, credentials);

  // Build (provider/bucketName) → alias lookup from connection configs
  const aliasLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of connectionConfigs) {
      map.set(`${c.provider}/${c.name}`, c.alias);
    }
    return map;
  }, [connectionConfigs]);

  const allRecentItems: TreeNode[] = useMemo(
    () =>
      recentlyViewed.map((item) => ({
        alias: aliasLookup.get(`${item.provider}/${item.bucketName}`) ?? "",
        provider: item.provider,
        bucketName: item.bucketName,
        pathName: item.pathName,
        name: item.name,
        type: item.type as TreeNode["type"],
        children: [],
      })),
    [recentlyViewed, aliasLookup],
  );

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
      pinnedPaths.map((pin) => ({
        alias: aliasLookup.get(`${pin.provider}/${pin.bucketName}`) ?? "",
        provider: pin.provider,
        bucketName: pin.bucketName,
        pathName: pin.pathName,
        name: pin.displayName,
        type: "directory" as const,
        children: [],
        _Object:
          pin.totalSize != null || pin.lastModified != null
            ? ({
                Size: pin.totalSize ?? undefined,
                LastModified: pin.lastModified
                  ? new Date(pin.lastModified)
                  : undefined,
              } as TreeNode["_Object"])
            : undefined,
      })),
    [pinnedPaths, aliasLookup],
  );

  return (
    <div className="flex flex-col gap-8 py-8 sm:gap-12 sm:py-12 lg:gap-16 lg:py-16">
      {recentImages.length > 0 && (
        <DirectoryView
          viewMode="grid-lg"
          nodes={recentImages.slice(0, 4)}
          name="Recently Viewed"
          bucketName=""
          flush
        >
          <ShowAllLink
            href="/recent"
            total={recentImages.length}
            maxItems={4}
          />
        </DirectoryView>
      )}

      {pinnedNodes.length > 0 && (
        <DirectoryView
          viewMode="list"
          nodes={pinnedNodes.slice(0, 10)}
          name="Pinned"
          bucketName=""
          flush
        />
      )}

      {recentDirs.length > 0 && (
        <DirectoryView
          viewMode="list"
          nodes={recentDirs.slice(0, 5)}
          name="Recently Browsed"
          bucketName=""
          flush
        >
          <ShowAllLink href="/recent" total={recentDirs.length} maxItems={5} />
        </DirectoryView>
      )}

      {recentFiles.length > 0 && (
        <DirectoryView
          viewMode="grid-sm"
          nodes={recentFiles.slice(0, 6)}
          name="Recent Files"
          bucketName=""
          flush
        >
          <ShowAllLink href="/recent" total={recentFiles.length} maxItems={6} />
        </DirectoryView>
      )}

      {nodes.length > 0 && (
        <DirectoryView
          viewMode="grid-md"
          nodes={nodes.slice(0, 100)}
          name={title}
          bucketName=""
          flush
        >
          <ShowAllLink href="/connections" total={nodes.length} maxItems={100} />
        </DirectoryView>
      )}

      {nodes.length === 0 && (
        <Section flush>
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
    </div>
  );
}
