import { EmptyState } from "@cytario/design";
import { FolderOpen } from "lucide-react";
import { ReactNode, useMemo } from "react";

import { TreeNode } from "./buildDirectoryTree";
import { DirectoryViewGrid } from "./DirectoryViewGrid";
import {
  bucketColumns,
  DirectoryViewTable,
  fileColumns,
} from "./DirectoryViewTable";
import { filterNodes } from "./filterNodes";
import { FilterSidebar } from "./FilterSidebar";
import { NodeInfoModal } from "./NodeInfoModal";
import { type ViewMode } from "./useLayoutStore";
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
  /** Omit default section padding (for gap-based layouts) */
  flush?: boolean;
}

export function DirectoryView({
  viewMode,
  nodes,
  name,
  showFilters = false,
  children,
  flush,
}: DirectoryViewProps) {
  const isBucket = nodes.length > 0 && nodes[0].type === "bucket";
  const columns = isBucket ? bucketColumns : fileColumns;
  const tableId = isBucket ? "bucket" : "directory";
  const isGrid = viewMode !== "list" && viewMode !== "list-wide";

  const { columnFilters, setColumnFilters } = useColumnFilters({ tableId });

  const filteredNodes = useMemo(
    () =>
      isGrid ? filterNodes(nodes, columnFilters, columns, isBucket) : nodes,
    [isGrid, nodes, columnFilters, columns, isBucket],
  );

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
      <SectionHeader name={name}>{children}</SectionHeader>

      {showFilters && isGrid && (
        <SidebarPortal>
          <FilterSidebar
            columns={columns}
            columnFilters={columnFilters}
            setColumnFilters={setColumnFilters}
          />
        </SidebarPortal>
      )}

      {isGrid ? (
        <Container>
          <DirectoryViewGrid nodes={filteredNodes} viewMode={viewMode} />
        </Container>
      ) : (
        <Container wide={viewMode === "list-wide"}>
          <DirectoryViewTable nodes={nodes} showFilters={showFilters} />
        </Container>
      )}

      <NodeInfoModal />
    </Section>
  );
}
