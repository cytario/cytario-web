import { ButtonLink, EmptyState } from "@cytario/design";
import { ArrowRight, FileSearch } from "lucide-react";
import { useMemo } from "react";
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
  type ShouldRevalidateFunction,
  Outlet,
  redirect,
  useLoaderData,
} from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { Section } from "~/components/Container";
import { DirectoryView } from "~/components/DirectoryView/DirectoryView";
import { useInitConnections } from "~/hooks/useInitConnections";
import { loadConnectionNodes } from "~/routes/connections/loadConnectionNodes";
import { deleteConnectionConfig } from "~/utils/connectionConfig.server";
import { getFileType, IMAGE_FILE_TYPES } from "~/utils/fileType";
import { useRecentlyViewedStore } from "~/utils/recentlyViewedStore/useRecentlyViewedStore";

const title = "Home";
const MAX_RECENT_IMAGES = 4;
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
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}) => {
  if (formAction) return defaultShouldRevalidate;
  // Revalidate when navigating back to home from another page
  if (currentUrl.pathname !== nextUrl.pathname) return true;
  return false;
};

export const middleware = [authMiddleware];

export const loader = async ({ context }: LoaderFunctionArgs) => {
  return loadConnectionNodes(context);
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);

  if (request.method.toLowerCase() === "delete") {
    const formData = await request.formData();
    const alias = String(formData.get("alias") ?? "");

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

export default function HomeRoute() {
  const { nodes, adminScopes, userId, credentials, connectionConfigs } =
    useLoaderData<typeof loader>();

  useInitConnections(connectionConfigs, credentials);

  const allRecentItems = useRecentlyViewedStore((state) => state.items);

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

  return (
    <div className="flex flex-col gap-8 py-8 sm:gap-12 sm:py-12 lg:gap-16 lg:py-16">
      {recentImages.length > 0 && (
        <DirectoryView
          viewMode="grid-lg"
          nodes={recentImages.slice(0, MAX_RECENT_IMAGES)}
          name="Recently Viewed"
          flush
        >
          <ShowAllLink
            href="/recent"
            total={recentImages.length}
            maxItems={MAX_RECENT_IMAGES}
          />
        </DirectoryView>
      )}

      {recentDirs.length > 0 && (
        <DirectoryView
          viewMode="list"
          nodes={recentDirs.slice(0, MAX_RECENT_DIRS)}
          name="Recently Browsed"
          flush
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
          flush
        >
          <ShowAllLink
            href="/recent"
            total={recentFiles.length}
            maxItems={MAX_RECENT_FILES}
          />
        </DirectoryView>
      )}

      {nodes.length > 0 && (
        <DirectoryView
          viewMode="grid-md"
          nodes={nodes.slice(0, MAX_CONNECTIONS)}
          name="Storage Connections"
          flush
        >
          <ShowAllLink
            href="/connections"
            total={nodes.length}
            maxItems={MAX_CONNECTIONS}
          />
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
