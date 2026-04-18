import { EmptyState, Input, Switch } from "@cytario/design";
import { FolderOpen } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { TreeNode } from "./buildDirectoryTree";
import { DirectoryViewGrid } from "./DirectoryViewGrid";
import {
  DirectoryViewTableConnection,
  connectionColumns,
} from "./DirectoryViewTableConnection";
import {
  DirectoryViewTableDirectory,
  fileColumns,
} from "./DirectoryViewTableDirectory";
import { DirectoryViewTree } from "./DirectoryViewTree";
import { filterHiddenNodes, filterNodes } from "./filterNodes";
import { type ViewMode, useLayoutStore } from "./useLayoutStore";
import { Container, Section, SectionHeader } from "~/components/Container";
import { useColumnFilters } from "~/components/Table/useColumnFilters";
import { useConnectionsStore } from "~/utils/connectionsStore";

interface DirectoryViewProps {
  nodes: TreeNode[];
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
  children,
  secondaryActions,
  flush,
}: DirectoryViewProps) {
  const isConnection = nodes.length > 0 && nodes[0].type === "bucket";
  const columns = isConnection ? connectionColumns : fileColumns;
  const tableId = isConnection ? "bucket" : "directory";
  const isGrid = viewMode === "grid" || viewMode === "grid-compact";
  const isTree = viewMode === "tree";

  const connections = useConnectionsStore((s) => s.connections);

  const showHiddenFiles = useLayoutStore((s) => s.showHiddenFiles);
  const toggleShowHiddenFiles = useLayoutStore((s) => s.toggleShowHiddenFiles);

  const [filterText, setFilterText] = useState("");

  // TODO(C-82): bridge between Table's internal filter state and Grid/Tree
  // rendering. Push filter awareness into Grid/Tree to remove this.
  const { columnFilters } = useColumnFilters({ tableId });

  // Filter hidden (dot-prefixed) files first, then apply column filters
  const visibleNodes = useMemo(
    () => filterHiddenNodes(nodes, showHiddenFiles),
    [nodes, showHiddenFiles],
  );

  const filteredNodes = useMemo(
    () =>
      isGrid
        ? filterNodes(visibleNodes, columnFilters, columns, isConnection, connections)
        : visibleNodes,
    [isGrid, visibleNodes, columnFilters, columns, isConnection, connections],
  );

  // Apply inline text filter for grid and list modes
  const displayNodes = useMemo(() => {
    if (!filterText) return filteredNodes;
    const term = filterText.toLowerCase();
    return filteredNodes.filter((node) =>
      node.name.toLowerCase().includes(term),
    );
  }, [filteredNodes, filterText]);

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
          <DirectoryViewTree nodes={visibleNodes} searchTerm={filterText} />
        </Container>
      ) : isGrid ? (
        <Container>
          {displayNodes.length > 0 ? (
            <DirectoryViewGrid nodes={displayNodes} viewMode={viewMode} />
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
            isConnection ? (
              <DirectoryViewTableConnection
                nodes={displayNodes}
                showFilters={showFilters}
              />
            ) : (
              <DirectoryViewTableDirectory
                nodes={displayNodes}
                showFilters={showFilters}
              />
            )
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
