import { Button, EmptyState } from "@cytario/design";
import { FileSearch } from "lucide-react";
import { useMemo } from "react";
import { type MetaFunction, type ShouldRevalidateFunction, useLoaderData } from "react-router";

import { Section } from "~/components/Container";
import { DashboardSection } from "~/components/DashboardSection";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { useModal } from "~/hooks/useModal";
import { type LoaderData } from "~/routes/connections/connections.loader";
import { favoriteToNode, filterByKnownConnection, recentToNode } from "~/utils/dashboardNodes";
import { useDashboardStore } from "~/utils/dashboardStore/useDashboardStore";
import { isImageFile } from "~/utils/fileType";

const title = "Storage Connections";
const MAX_RECENT_IMAGES = 4;
const MAX_FAVORITES = 10;
const MAX_RECENT_DIRS = 5;
const MAX_RECENT_FILES = 6;
const MAX_CONNECTIONS = 100;

export const meta: MetaFunction = () => {
  return [{ title }, { name: "description", content: "Manage your storage connections" }];
};

export const shouldRevalidate: ShouldRevalidateFunction = ({
  formAction,
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}) => {
  if (formAction) return defaultShouldRevalidate;
  if (currentUrl.pathname !== nextUrl.pathname) return true;
  return false;
};

export { enrichConnectionsWithPreviews as clientLoader } from "~/routes/connections/connections.clientLoader";
export { loadConnections as loader } from "~/routes/connections/connections.loader";

// Response carries STS credentials — keep it out of every cache between origin
// and browser.
export const headers = () => ({ "Cache-Control": "no-store, private" });

export default function HomeRoute() {
  const { nodes, connectionConfigs } = useLoaderData<LoaderData>();

  // Recents/favorites are composed once in the protected layout and seeded to
  // the dashboard store — home and the sidebar read the same source.
  const recentlyViewed = useDashboardStore((s) => s.recentlyViewed);
  const favorites = useDashboardStore((s) => s.favorites);

  const { openModal } = useModal();

  const allRecentItems = useMemo(
    () => filterByKnownConnection(recentlyViewed, connectionConfigs).map(recentToNode),
    [recentlyViewed, connectionConfigs],
  );

  const { recentImages, recentDirs, recentFiles } = useMemo(() => {
    const images: TreeNode[] = [];
    const dirs: TreeNode[] = [];
    const files: TreeNode[] = [];
    for (const n of allRecentItems) {
      if (n.type === "directory") dirs.push(n);
      else if (isImageFile(n.name)) images.push(n);
      else files.push(n);
    }
    return { recentImages: images, recentDirs: dirs, recentFiles: files };
  }, [allRecentItems]);

  const favoriteNodes = useMemo(
    () => filterByKnownConnection(favorites, connectionConfigs).map(favoriteToNode),
    [favorites, connectionConfigs],
  );

  return (
    <div className="flex flex-col gap-8 py-8 sm:gap-12 sm:py-12 lg:gap-16 lg:py-16">
      <DashboardSection
        title="Recently Viewed"
        nodes={recentImages}
        viewMode="grid"
        maxItems={MAX_RECENT_IMAGES}
        showAllHref="/recent"
      />

      <DashboardSection
        title="Favorites"
        nodes={favoriteNodes}
        viewMode="list"
        maxItems={MAX_FAVORITES}
        showAllHref="/favorites"
      />

      <DashboardSection
        title="Recently Browsed"
        nodes={recentDirs}
        viewMode="list"
        maxItems={MAX_RECENT_DIRS}
        showAllHref="/recent"
      />

      <DashboardSection
        title="Recent Files"
        nodes={recentFiles}
        viewMode="grid"
        maxItems={MAX_RECENT_FILES}
        showAllHref="/recent"
      />

      <DashboardSection
        title={title}
        nodes={nodes}
        viewMode="grid"
        maxItems={MAX_CONNECTIONS}
        showAllHref="/connections"
      />

      {nodes.length === 0 && (
        <Section flush>
          <EmptyState
            icon={FileSearch}
            title="Start exploring your data"
            description="Add a storage connection to view your cloud storage."
            action={
              <Button size="lg" variant="neutral" onPress={() => openModal("add-connection")}>
                Connect Storage
              </Button>
            }
          />
        </Section>
      )}
    </div>
  );
}
