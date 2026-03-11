import { Button, EmptyState, H1, Input, Switch } from "@cytario/design";
import type { ColumnFiltersState } from "@tanstack/react-table";
import { Clock, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
  useFetcher,
  useLoaderData,
} from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { Container, Section } from "~/components/Container";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryViewGrid } from "~/components/DirectoryView/DirectoryViewGrid";
import {
  DirectoryViewTable,
  fileColumns,
} from "~/components/DirectoryView/DirectoryViewTable";
import { DirectoryViewTree } from "~/components/DirectoryView/DirectoryViewTree";
import {
  filterHiddenNodes,
  filterNodes,
} from "~/components/DirectoryView/filterNodes";
import { NodeInfoModal } from "~/components/DirectoryView/NodeInfoModal";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import {
  clearAllRecentlyViewed,
  getRecentlyViewed,
} from "~/utils/recentlyViewed.server";

export const meta: MetaFunction = () => [{ title: "Recent — Cytario" }];

export const handle = {
  breadcrumb: () => ({ label: "Recent", to: "/recent" }),
};

export const middleware = [authMiddleware];

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { user } = context.get(authContext);
  if (request.method.toUpperCase() === "DELETE") {
    await clearAllRecentlyViewed(user.sub);
    return { ok: true };
  }
  return null;
};

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { user, connectionConfigs } = context.get(authContext);
  const raw = await getRecentlyViewed(user.sub, 50);
  return {
    connectionConfigs,
    recentlyViewed: raw.map((item) => ({
      id: item.id,
      connectionName: item.connectionName,
      pathName: item.pathName,
      name: item.name,
      type: item.type,
      viewedAt: item.viewedAt.toISOString(),
    })),
  };
};

export default function RecentRoute() {
  const { connectionConfigs, recentlyViewed } =
    useLoaderData<typeof loader>();
  const { viewMode, showHiddenFiles, toggleShowHiddenFiles } =
    useLayoutStore();
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [filterText, setFilterText] = useState("");
  const clearFetcher = useFetcher();

  const configByAlias = useMemo(() => {
    const map = new Map<string, (typeof connectionConfigs)[number]>();
    for (const c of connectionConfigs) map.set(c.name, c);
    return map;
  }, [connectionConfigs]);

  const allItems: TreeNode[] = useMemo(
    () =>
      recentlyViewed
        .filter((item) => configByAlias.has(item.connectionName))
        .map((item) => {
          const config = configByAlias.get(item.connectionName)!;
          return {
            connectionName: item.connectionName,
            provider: config.provider,
            bucketName: config.bucketName,
            pathName: item.pathName,
            name: item.name,
            type: item.type as TreeNode["type"],
            children: [],
          };
        }),
    [recentlyViewed, configByAlias],
  );

  const isGrid = viewMode === "grid" || viewMode === "grid-compact";
  const isTree = viewMode === "tree";

  // Filter hidden (dot-prefixed) files first, then apply column filters
  const visibleItems = useMemo(
    () => filterHiddenNodes(allItems, showHiddenFiles),
    [allItems, showHiddenFiles],
  );

  const filteredNodes = useMemo(
    () =>
      isGrid
        ? filterNodes(visibleItems, columnFilters, fileColumns)
        : visibleItems,
    [isGrid, visibleItems, columnFilters],
  );

  // Apply inline text filter for grid and list modes
  const displayNodes = useMemo(() => {
    if (!filterText) return filteredNodes;
    const term = filterText.toLowerCase();
    return filteredNodes.filter((node) =>
      node.name.toLowerCase().includes(term),
    );
  }, [filteredNodes, filterText]);

  return (
    <Section>
      <Container>
        <div className="flex items-center justify-between">
          <H1>Recent</H1>
          <div className="flex items-center gap-2">
            {allItems.length > 0 && (
              <Button
                variant="secondary"
                onPress={() =>
                  clearFetcher.submit({}, { method: "delete" })
                }
              >
                <Trash2 size={16} />
                Clear history
              </Button>
            )}
            <ViewModeToggle />
          </div>
        </div>
      </Container>

      {allItems.length > 0 && (
        <Container>
          <div className="mb-6 flex items-center justify-between gap-3 min-h-[40px]">
            <Input
              aria-label="Filter files"
              placeholder="Filter files..."
              size="sm"
              value={filterText}
              onChange={setFilterText}
              className="w-64"
            />
            <Switch
              isSelected={showHiddenFiles}
              onChange={toggleShowHiddenFiles}
              className="text-xs font-medium text-[var(--color-text-secondary)]"
            >
              Show hidden
            </Switch>
          </div>
        </Container>
      )}

      {allItems.length > 0 ? (
        <div className="mt-8">
          {isTree ? (
            <Container>
              <DirectoryViewTree nodes={visibleItems} searchTerm={filterText} />
            </Container>
          ) : isGrid ? (
            <Container>
              <DirectoryViewGrid nodes={displayNodes} viewMode={viewMode} />
            </Container>
          ) : (
            <Container>
              <DirectoryViewTable
                nodes={displayNodes}
                showFilters
                columnFilters={columnFilters}
                onColumnFiltersChange={setColumnFilters}
              />
            </Container>
          )}
        </div>
      ) : (
        <EmptyState
          icon={Clock}
          title="No recent items"
          description="Items you view or browse will appear here."
        />
      )}
      <NodeInfoModal />
    </Section>
  );
}
