import { Button, EmptyState } from "@cytario/design";
import { FileSearch } from "lucide-react";
import { useMemo } from "react";
import {
  type MetaFunction,
  type ShouldRevalidateFunction,
  useLoaderData,
} from "react-router";

import { Section } from "~/components/Container";
import { DashboardSection } from "~/components/DashboardSection";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { useModal } from "~/hooks/useModal";
import {
  type LoaderData,
  type SerializedPinnedPath,
  type SerializedRecentlyViewed,
} from "~/routes/connections/connections.loader";
import { getFileType, IMAGE_FILE_TYPES } from "~/utils/fileType";


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
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}) => {
  if (formAction) return defaultShouldRevalidate;
  // Revalidate when navigating back to home from another page
  if (currentUrl.pathname !== nextUrl.pathname) return true;
  return false;
};

export { loadConnections as loader } from "~/routes/connections/connections.loader";

export default function HomeRoute() {
  const { nodes, connectionConfigs, recentlyViewed, pinnedPaths } =
    useLoaderData<LoaderData>();

  const { openModal } = useModal();

  const configByName = useMemo(() => {
    const map = new Map<string, (typeof connectionConfigs)[number]>();
    for (const c of connectionConfigs) map.set(c.name, c);
    return map;
  }, [connectionConfigs]);

  const allRecentItems: TreeNode[] = useMemo(
    () =>
      recentlyViewed
        .filter((item: SerializedRecentlyViewed) =>
          configByName.has(item.connectionName),
        )
        .map((item: SerializedRecentlyViewed) => {
          return {
            id: `${item.connectionName}/${item.pathName}`,
            connectionName: item.connectionName,
            pathName: item.pathName,
            name: item.name,
            type: item.type as TreeNode["type"],
            children: [],
          };
        }),
    [recentlyViewed, configByName],
  );

  const { recentImages, recentDirs, recentFiles } = useMemo(() => {
    const images: TreeNode[] = [];
    const dirs: TreeNode[] = [];
    const files: TreeNode[] = [];
    for (const n of allRecentItems) {
      if (n.type === "directory") dirs.push(n);
      else if (IMAGE_FILE_TYPES.has(getFileType(n.name))) images.push(n);
      else files.push(n);
    }
    return { recentImages: images, recentDirs: dirs, recentFiles: files };
  }, [allRecentItems]);

  const pinnedNodes: TreeNode[] = useMemo(
    () =>
      pinnedPaths
        .filter((pin: SerializedPinnedPath) =>
          configByName.has(pin.connectionName),
        )
        .map((pin: SerializedPinnedPath) => {
          return {
            id: `${pin.connectionName}/${pin.pathName}`,
            connectionName: pin.connectionName,
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
          };
        }),
    [pinnedPaths, configByName],
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
        title="Pinned"
        nodes={pinnedNodes}
        viewMode="list"
        maxItems={MAX_PINNED}
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
        viewMode="grid-compact"
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
              <Button
                size="lg"
                variant="neutral"
                onPress={() => openModal("add-connection")}
              >
                Connect Storage
              </Button>
            }
          />
        </Section>
      )}

    </div>
  );
}
