import { EmptyState } from "@cytario/design";
import { FolderOpen } from "lucide-react";
import { ReactNode, useEffect, useMemo } from "react";

import {
  computeDirectoryLastModified,
  computeDirectorySize,
  TreeNode,
} from "./buildDirectoryTree";
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
import { useRecentlyViewedStore } from "~/utils/recentlyViewedStore/useRecentlyViewedStore";

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
  alias,
  urlPath,
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

  // Track recently viewed directories
  const { addItem } = useRecentlyViewedStore();
  useEffect(() => {
    if (!alias || !urlPath) return;
    const firstNode = nodes[0];
    if (!firstNode) return;

    const totalSize = nodes.reduce(
      (sum, child) => sum + computeDirectorySize(child),
      0,
    );
    const latestModified = nodes.reduce(
      (max, child) => Math.max(max, computeDirectoryLastModified(child)),
      0,
    );
    addItem({
      alias,
      provider: firstNode.provider,
      bucketName: firstNode.bucketName,
      pathName: urlPath,
      name,
      type: "directory",
      children: [],
      _Object: {
        Size: totalSize || undefined,
        LastModified: latestModified ? new Date(latestModified) : undefined,
      } as TreeNode["_Object"],
    });
  }, [alias, urlPath, name, addItem, nodes]);

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
