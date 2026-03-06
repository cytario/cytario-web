import { EmptyState, H1 } from "@cytario/design";
import type { ColumnFiltersState } from "@tanstack/react-table";
import { Clock, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  type ActionFunction,
  type LoaderFunction,
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
import { filterNodes } from "~/components/DirectoryView/filterNodes";
import { FilterSidebar } from "~/components/DirectoryView/FilterSidebar";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { SidebarPortal } from "~/components/SidebarPortal";
import { clearAllRecentlyViewed, getRecentlyViewed } from "~/utils/recentlyViewed.server";

export const meta: MetaFunction = () => [{ title: "Recent — Cytario" }];

export const middleware = [authMiddleware];

export const action: ActionFunction = async ({ request, context }) => {
  const { user } = context.get(authContext);
  if (request.method.toUpperCase() === "DELETE") {
    await clearAllRecentlyViewed(user.sub);
    return { ok: true };
  }
  return null;
};

export const loader: LoaderFunction = async ({ context }) => {
  const { user } = context.get(authContext);
  const raw = await getRecentlyViewed(user.sub, 50);
  return {
    recentlyViewed: raw.map((item) => ({
      id: item.id,
      provider: item.provider,
      bucketName: item.bucketName,
      pathName: item.pathName,
      name: item.name,
      type: item.type,
      viewedAt: item.viewedAt.toISOString(),
    })),
  };
};

type RecentLoaderData = {
  recentlyViewed: Array<{
    id: number;
    provider: string;
    bucketName: string;
    pathName: string;
    name: string;
    type: string;
    viewedAt: string;
  }>;
};

export default function RecentRoute() {
  const { recentlyViewed } = useLoaderData<RecentLoaderData>();
  const { viewMode } = useLayoutStore();
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const clearFetcher = useFetcher();

  const allItems: TreeNode[] = useMemo(
    () =>
      recentlyViewed.map((item) => ({
        provider: item.provider,
        bucketName: item.bucketName,
        pathName: item.pathName,
        name: item.name,
        type: item.type as TreeNode["type"],
        children: [],
      })),
    [recentlyViewed],
  );

  const isGrid = viewMode !== "list" && viewMode !== "list-wide";
  const filteredNodes = useMemo(
    () =>
      isGrid ? filterNodes(allItems, columnFilters, fileColumns) : allItems,
    [isGrid, allItems, columnFilters],
  );

  return (
    <Section>
      {isGrid && (
        <SidebarPortal>
          <FilterSidebar
            columns={fileColumns}
            columnFilters={columnFilters}
            setColumnFilters={setColumnFilters}
          />
        </SidebarPortal>
      )}
      <Container>
        <div className="flex items-center justify-between">
          <H1>Recent</H1>
          <div className="flex items-center gap-2">
            {allItems.length > 0 && (
              <button
                type="button"
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-md hover:bg-slate-50"
                onClick={() =>
                  clearFetcher.submit({}, { method: "delete" })
                }
              >
                <Trash2 size={16} />
                Clear history
              </button>
            )}
            <ViewModeToggle />
          </div>
        </div>
      </Container>

      {allItems.length > 0 ? (
        <div className="mt-8">
          {viewMode === "list" || viewMode === "list-wide" ? (
            <Container wide={viewMode === "list-wide"}>
              <DirectoryViewTable
                nodes={allItems}
                showFilters
                columnFilters={columnFilters}
                onColumnFiltersChange={setColumnFilters}
              />
            </Container>
          ) : (
            <Container>
              <DirectoryViewGrid nodes={filteredNodes} viewMode={viewMode} />
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
    </Section>
  );
}
