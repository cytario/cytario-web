import { ReactNode, useEffect, useMemo } from "react";
import { useFetcher } from "react-router";

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
import { Placeholder } from "~/components/Placeholder";
import { SidebarPortal } from "~/components/SidebarPortal";
import { useColumnFilters } from "~/components/Table/useColumnFilters";

export interface DirectoryViewBaseProps {
  nodes: TreeNode[];
  provider?: string;
  bucketName: string;
  pathName?: string;
}

interface DirectoryViewProps extends DirectoryViewBaseProps {
  viewMode: ViewMode;
  name: string;
  showFilters?: boolean;
  children?: ReactNode;
}

export function DirectoryView({
  viewMode,
  nodes,
  name,
  showFilters = false,
  provider,
  bucketName,
  pathName,
  children,
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

  const recentFetcher = useFetcher();

  useEffect(() => {
    if (!provider || !bucketName || !pathName) return;

    recentFetcher.submit(
      { provider, bucketName, pathName, name, type: "directory" },
      { method: "post", action: "/api/recently-viewed" },
    );
  }, [provider, bucketName, pathName, name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (nodes.length === 0) {
    return (
      <Section>
        <Placeholder
          icon="FolderOpen"
          title="No items found"
          description="This folder is empty or you may not have permission to view its contents."
        />
      </Section>
    );
  }

  return (
    <Section>
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
