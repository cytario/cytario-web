import { Button, EmptyState } from "@cytario/design";
import { useMemo } from "react";
import {
  type MetaFunction,
  type ShouldRevalidateFunction,
  useLoaderData,
  useRouteLoaderData,
} from "react-router";

import { DashboardSection } from "~/components/DashboardSection";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { useModal } from "~/hooks/useModal";
import { type LoaderData } from "~/routes/connections/connections.loader";
import type { loader as protectedLayoutLoader } from "~/routes/layouts/protected.layout";
import { isImageFile } from "~/utils/fileType";
import { favoriteToNode, filterByKnownConnection, recentToNode } from "~/utils/treeNodeFactories";

const title = "cytario®";
const MAX_RECENT_IMAGES = 4;
const MAX_FAVORITES = 10;
const MAX_RECENT_DIRS = 5;
const MAX_RECENT_FILES = 6;
const MAX_CONNECTIONS = 100;

export const meta: MetaFunction = () => {
  return [{ title }, { name: "description", content: "Manage your connections" }];
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

  // Recents/favorites are composed once in the protected layout; home and the
  // sidebar both read that loader.
  const layoutData = useRouteLoaderData<typeof protectedLayoutLoader>(
    "routes/layouts/protected.layout",
  );

  const { openModal } = useModal();

  const allRecentItems = useMemo(
    () =>
      filterByKnownConnection(layoutData?.recentlyViewed ?? [], connectionConfigs).map(
        recentToNode,
      ),
    [layoutData, connectionConfigs],
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
    () =>
      filterByKnownConnection(layoutData?.favorites ?? [], connectionConfigs).map(favoriteToNode),
    [layoutData, connectionConfigs],
  );

  return (
    <>
      {nodes.length === 0 && (
        <EmptyState
          icon="FileSearch"
          title="Start exploring your data"
          description="Add a connection to view your cloud storage."
          action={
            <Button size="lg" variant="neutral" onPress={() => openModal("add-connection")}>
              Add Connection
            </Button>
          }
        />
      )}

      <DashboardSection
        title="Connections"
        nodes={nodes}
        viewMode="grid"
        maxItems={MAX_CONNECTIONS}
        to="/connections"
      />

      <DashboardSection
        title="Recently Viewed"
        nodes={recentImages}
        viewMode="grid"
        maxItems={MAX_RECENT_IMAGES}
        to="/recent"
      />

      <DashboardSection
        title="Favorites"
        nodes={favoriteNodes}
        viewMode="list"
        maxItems={MAX_FAVORITES}
        to="/favorites"
      />

      <DashboardSection
        title="Recently Browsed"
        nodes={recentDirs}
        viewMode="list"
        maxItems={MAX_RECENT_DIRS}
        to="/recent"
      />

      <DashboardSection
        title="Recent Files"
        nodes={recentFiles}
        viewMode="grid"
        maxItems={MAX_RECENT_FILES}
        to="/recent"
      />
    </>
  );
}
