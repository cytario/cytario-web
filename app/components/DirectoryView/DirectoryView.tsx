import { EmptyState } from "@cytario/design";
import { FolderOpen } from "lucide-react";
import { ReactNode, useEffect, useMemo } from "react";
import { useFetcher } from "react-router";

import { TreeNode } from "./buildDirectoryTree";
import { DirectoryViewGrid } from "./DirectoryViewGrid";
import {
  bucketColumns,
  DirectoryViewTable,
  fileColumns,
} from "./DirectoryViewTable";
import { filterHiddenNodes, filterNodes } from "./filterNodes";
import { FilterSidebar } from "./FilterSidebar";
import { NodeInfoModal } from "./NodeInfoModal";
import { type ViewMode, useLayoutStore } from "./useLayoutStore";
import { Container, Section, SectionHeader } from "~/components/Container";
import { SidebarPortal } from "~/components/SidebarPortal";
import { useColumnFilters } from "~/components/Table/useColumnFilters";

export interface DirectoryViewBaseProps {
  nodes: TreeNode[];
  /** Connection alias for breadcrumb context */
  alias?: string;
  /** URL path relative to connection root */
  urlPath?: string;
}

interface DirectoryViewProps extends DirectoryViewBaseProps {
  viewMode: ViewMode;
  name: string;
  showFilters?: boolean;
  children?: ReactNode;
  /** Actions rendered in a second row beneath the header title */
  secondaryActions?: ReactNode;
  /** Omit default section padding (for gap-based layouts) */
  flush?: boolean;
}

export function DirectoryView({
  viewMode,
  nodes,
  name,
  showFilters = false,
  alias,
  urlPath,
  children,
  secondaryActions,
  flush,
}: DirectoryViewProps) {
  const isBucket = nodes.length > 0 && nodes[0].type === "bucket";
  const columns = isBucket ? bucketColumns : fileColumns;
  const tableId = isBucket ? "bucket" : "directory";
  const isGrid = viewMode !== "list" && viewMode !== "list-wide";

  const showHiddenFiles = useLayoutStore((s) => s.showHiddenFiles);

  const { columnFilters, setColumnFilters } = useColumnFilters({ tableId });

  // Filter hidden (dot-prefixed) files first, then apply column filters
  const visibleNodes = useMemo(
    () => filterHiddenNodes(nodes, showHiddenFiles),
    [nodes, showHiddenFiles],
  );

  const filteredNodes = useMemo(
    () =>
      isGrid
        ? filterNodes(visibleNodes, columnFilters, columns, isBucket)
        : visibleNodes,
    [isGrid, visibleNodes, columnFilters, columns, isBucket],
  );

  // Track recently viewed directories (DB-backed via server action)
  const recentFetcher = useFetcher();
  useEffect(() => {
    if (!alias || !urlPath) return;
    recentFetcher.submit(
      { alias, pathName: urlPath, name, type: "directory" },
      { method: "post", action: "/api/recently-viewed" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alias, urlPath, name]);

  if (nodes.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="Empty directory"
        description="This folder is empty or you may not have permission to view its contents."
      />
    );
  }

  return (
    <Section flush={flush}>
      <SectionHeader name={name} secondaryActions={secondaryActions}>
        {children}
      </SectionHeader>

      {showFilters && (
        <SidebarPortal>
          <FilterSidebar
            columns={columns}
            columnFilters={columnFilters}
            setColumnFilters={setColumnFilters}
            alias={alias}
            showColumnFilters={isGrid}
          />
        </SidebarPortal>
      )}

      {isGrid ? (
        <Container>
          {filteredNodes.length > 0 ? (
            <DirectoryViewGrid nodes={filteredNodes} viewMode={viewMode} />
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              No items match the current filters. Try adjusting the filters in
              the sidebar, or enable &ldquo;Show hidden files&rdquo; to see
              dot-prefixed entries.
            </p>
          )}
        </Container>
      ) : (
        <Container wide={viewMode === "list-wide"}>
          {filteredNodes.length > 0 ? (
            <DirectoryViewTable
              nodes={filteredNodes}
              showFilters={showFilters}
            />
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              No items match the current filters. Enable &ldquo;Show hidden
              files&rdquo; in the sidebar to see dot-prefixed entries.
            </p>
          )}
        </Container>
      )}

      <NodeInfoModal />
    </Section>
  );
}
