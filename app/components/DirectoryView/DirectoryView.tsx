import { EmptyState, Input, Switch } from "@cytario/design";
import { FolderOpen } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";

import { TreeNode } from "./buildDirectoryTree";
import { DirectoryViewGrid } from "./DirectoryViewGrid";
import {
  connectionColumns,
  DirectoryViewTable,
  fileColumns,
} from "./DirectoryViewTable";
import { DirectoryViewTree } from "./DirectoryViewTree";
import { filterHiddenNodes, filterNodes } from "./filterNodes";
import { type ViewMode, useLayoutStore } from "./useLayoutStore";
import { Container, Section, SectionHeader } from "~/components/Container";
import { useColumnFilters } from "~/components/Table/useColumnFilters";

export interface DirectoryViewBaseProps {
  nodes: TreeNode[];
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
  // connectionName,
  urlPath,
  children,
  secondaryActions,
  flush,
}: DirectoryViewProps) {
  const isConnection = nodes.length > 0 && nodes[0].type === "bucket";
  const columns = isConnection ? connectionColumns : fileColumns;
  const tableId = isConnection ? "bucket" : "directory";
  const isGrid = viewMode === "grid" || viewMode === "grid-compact";
  const isTree = viewMode === "tree";

  const connectionName = name;

  const showHiddenFiles = useLayoutStore((s) => s.showHiddenFiles);
  const toggleShowHiddenFiles = useLayoutStore((s) => s.toggleShowHiddenFiles);

  const [filterText, setFilterText] = useState("");

  const { columnFilters } = useColumnFilters({ tableId });

  // Filter hidden (dot-prefixed) files first, then apply column filters
  const visibleNodes = useMemo(
    () => filterHiddenNodes(nodes, showHiddenFiles),
    [nodes, showHiddenFiles],
  );

  const filteredNodes = useMemo(
    () =>
      isGrid
        ? filterNodes(visibleNodes, columnFilters, columns, isConnection)
        : visibleNodes,
    [isGrid, visibleNodes, columnFilters, columns, isConnection],
  );

  // Apply inline text filter for grid and list modes
  const displayNodes = useMemo(() => {
    if (!filterText) return filteredNodes;
    const term = filterText.toLowerCase();
    return filteredNodes.filter((node) =>
      node.name.toLowerCase().includes(term),
    );
  }, [filteredNodes, filterText]);

  // Track recently viewed directories (DB-backed via server action)
  const recentFetcher = useFetcher();
  useEffect(() => {
    if (!connectionName || !urlPath) return;
    recentFetcher.submit(
      { connectionName, pathName: urlPath, name, type: "directory" },
      { method: "post", action: "/api/recently-viewed" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionName, urlPath, name]);

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
        <Container>
          <div className="mb-6 flex items-center justify-between gap-3 min-h-10">
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
              className="text-xs font-medium text-(--color-text-secondary)"
            >
              Show hidden
            </Switch>
          </div>
        </Container>
      )}

      {isTree ? (
        <Container>
          <DirectoryViewTree nodes={visibleNodes} searchTerm={filterText} connectionName={connectionName} />
        </Container>
      ) : isGrid ? (
        <Container>
          {displayNodes.length > 0 ? (
            <DirectoryViewGrid nodes={displayNodes} viewMode={viewMode} connectionName={connectionName} />
          ) : (
            <p className="py-8 text-center text-sm text-(--color-text-secondary)">
              No items match the current filters. Try adjusting the filter, or
              enable &ldquo;Show hidden files&rdquo; to see dot-prefixed
              entries.
            </p>
          )}
        </Container>
      ) : (
        <Container>
          {displayNodes.length > 0 ? (
            <DirectoryViewTable
              nodes={displayNodes}
              showFilters={showFilters}
            />
          ) : (
            <p className="py-8 text-center text-sm text-(--color-text-secondary)">
              No items match the current filters. Enable &ldquo;Show hidden
              files&rdquo; to see dot-prefixed entries.
            </p>
          )}
        </Container>
      )}
    </Section>
  );
}
