import { EmptyState, H1 } from "@cytario/design";
import type { ColumnFiltersState } from "@tanstack/react-table";
import { Clock } from "lucide-react";
import { useMemo, useState } from "react";
import { type MetaFunction } from "react-router";

import { authMiddleware } from "~/.server/auth/authMiddleware";
import { Container, Section } from "~/components/Container";
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
import { useRecentlyViewedStore } from "~/utils/recentlyViewedStore/useRecentlyViewedStore";

export const middleware = [authMiddleware];

export const meta: MetaFunction = () => [{ title: "Recent — Cytario" }];

export default function RecentRoute() {
  const { viewMode } = useLayoutStore();
  const allItems = useRecentlyViewedStore((state) => state.items);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

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
          <ViewModeToggle />
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
