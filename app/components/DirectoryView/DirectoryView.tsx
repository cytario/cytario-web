import type { ReactNode } from "react";
import { useMemo } from "react";

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
import { FilterBar } from "./FilterBar";
import {
  filterHiddenNodes,
  filterNodes,
  getNodeAccessors,
} from "./filterNodes";
import { type ViewMode, useLayoutStore } from "./useLayoutStore";
import { Container, Section, SectionHeader } from "~/components/Container";
import { useColumnFilters } from "~/components/Table/useColumnFilters";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

/**
 * What the DirectoryView is listing. Drives column config, the table
 * subcomponent, the grid card, and the shared filter-store slot.
 * - `"connections"` — top-level list of storage connections (provider/scope/region columns).
 * - `"entries"` — files **and** directories inside a connection (type/size/modified columns).
 */
export type DirectoryKind = "connections" | "entries";

interface DirectoryViewProps {
  /** What this view is listing — describes the route, not the data. */
  kind: DirectoryKind;
  nodes: TreeNode[];
  viewMode: ViewMode;
  name: string;
  children?: ReactNode;
  /** Actions rendered in a second row beneath the header title */
  secondaryActions?: ReactNode;
  /** Omit default section padding (for gap-based layouts) */
  flush?: boolean;
}

export function DirectoryView({
  kind,
  viewMode,
  nodes,
  name,
  children,
  secondaryActions,
  flush,
}: DirectoryViewProps) {
  const columns = kind === "connections" ? connectionColumns : fileColumns;
  const isGrid = viewMode === "grid" || viewMode === "grid-compact";
  const isTree = viewMode === "tree";

  const connections = useConnectionsStore(select.connections);
  const showHiddenFiles = useLayoutStore((s) => s.showHiddenFiles);
  const showFilters = useLayoutStore((s) => s.showFilters);

  const { columnFilters } = useColumnFilters({ tableId: kind });

  // allNodes -> filteredNodes -> DirectoryView -> (Grid | Table | Tree)
  // Hidden-file filter first, then column filters. Same `filteredNodes`
  // feeds every view mode.
  const visibleNodes = useMemo(
    () => filterHiddenNodes(nodes, showHiddenFiles),
    [nodes, showHiddenFiles],
  );

  const filteredNodes = useMemo(
    () =>
      filterNodes(
        visibleNodes,
        columnFilters,
        columns,
        kind,
        connections,
      ),
    [visibleNodes, columnFilters, columns, kind, connections],
  );

  // Derive unique values per filterable select column so FilterBar's select
  // inputs offer real options (mirrors tanstack's getFacetedUniqueValues used
  // by the table column-header filter).
  const dynamicOptions = useMemo(() => {
    const accessors = getNodeAccessors(kind, connections);
    const result: Record<string, { label: string; value: string }[]> = {};
    for (const col of columns) {
      if (col.filterType !== "select" || col.filterOptions) continue;
      const accessor = accessors[col.id];
      if (!accessor) continue;
      const unique = new Set<string>();
      for (const node of visibleNodes) {
        const v = accessor(node);
        if (v) unique.add(v);
      }
      result[col.id] = [...unique].sort().map((v) => ({ label: v, value: v }));
    }
    return result;
  }, [visibleNodes, columns, kind, connections]);

  // Tree mode only filters by name (via the design-system Tree's `searchTerm`).
  // Non-name filters (type, scope, provider) are inert in tree mode. The tree
  // view at prefix level is an anti-pattern anyway — proper tree-based
  // navigation belongs in a global sidebar per C-56
  // (https://app.plane.so/cytario/browse/C-56/).
  const nameFilter =
    (columnFilters.find((f) => f.id === "name")?.value as string) ?? "";

  return (
    <Section flush={flush}>
      <SectionHeader name={name} secondaryActions={secondaryActions}>
        {children}
      </SectionHeader>

      {showFilters && viewMode !== "list" && (
        <Container>
          <FilterBar
            columns={columns}
            tableId={kind}
            dynamicOptions={dynamicOptions}
          />
        </Container>
      )}

      <Container>
        {isTree ? (
          <DirectoryViewTree
            nodes={visibleNodes}
            searchTerm={nameFilter}
            kind={kind}
          />
        ) : isGrid ? (
          <DirectoryViewGrid
            nodes={filteredNodes}
            viewMode={viewMode}
            kind={kind}
          />
        ) : kind === "connections" ? (
          <DirectoryViewTableConnection
            nodes={filteredNodes}
            showFilters={showFilters}
          />
        ) : (
          <DirectoryViewTableDirectory
            nodes={filteredNodes}
            showFilters={showFilters}
          />
        )}
      </Container>
    </Section>
  );
}
