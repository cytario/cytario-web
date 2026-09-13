import { useColumnFilters } from "@cytario/design";
import type { ReactNode } from "react";
import { useMemo } from "react";

import { TreeNode } from "./buildDirectoryTree";
import { DirectoryViewGrid } from "./DirectoryViewGrid";
import { DirectoryViewTableConnection, connectionColumns } from "./DirectoryViewTableConnection";
import { DirectoryViewTableDirectory, fileColumns } from "./DirectoryViewTableDirectory";
import { filterHiddenNodes, filterNodes } from "./filterNodes";
import { useLayoutStore } from "./useLayoutStore";
import { Container, Section, SectionHeader } from "~/components/Container";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

/**
 * What the DirectoryView is listing. Drives column config, the table
 * subcomponent, the grid card, and the shared filter-store slot.
 * - `"connections"` — top-level list of connections (provider/scope/region columns).
 * - `"entries"` — files **and** directories inside a connection (type/size/modified columns).
 */
export type DirectoryKind = "connections" | "entries";

interface DirectoryViewProps {
  kind: DirectoryKind;
  node: TreeNode;

  children?: ReactNode;
}

export function DirectoryView({ kind, node, children }: DirectoryViewProps) {
  const nodes = useMemo(() => node.children ?? [], [node.children]);
  const viewMode = useLayoutStore((s) => s.viewMode);
  const columns = kind === "connections" ? connectionColumns : fileColumns;
  const isGrid = viewMode === "grid";

  const connections = useConnectionsStore(select.connections);
  const showHiddenFiles = useLayoutStore((s) => s.showHiddenFiles);

  const { columnFilters } = useColumnFilters({ tableId: kind });

  // allNodes -> filteredNodes -> DirectoryView -> (Grid | Table)
  // Hidden-file filter first, then column filters. Same `filteredNodes`
  // feeds every view mode.
  const visibleNodes = useMemo(
    () => filterHiddenNodes(nodes, showHiddenFiles),
    [nodes, showHiddenFiles],
  );

  const filteredNodes = useMemo(
    () => filterNodes(visibleNodes, columnFilters, columns, kind, connections),
    [visibleNodes, columnFilters, columns, kind, connections],
  );

  return (
    <Section>
      <SectionHeader name={node.name}>{children}</SectionHeader>

      <Container>
        {isGrid ? (
          <DirectoryViewGrid nodes={filteredNodes} kind={kind} />
        ) : kind === "connections" ? (
          <DirectoryViewTableConnection nodes={filteredNodes} />
        ) : (
          <DirectoryViewTableDirectory nodes={filteredNodes} />
        )}
      </Container>
    </Section>
  );
}
