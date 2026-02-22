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

  const { addItem } = useRecentlyViewedStore();

  useEffect(() => {
    if (!provider || !bucketName || !pathName) return;

    const totalSize = nodes.reduce(
      (sum, child) => sum + computeDirectorySize(child),
      0,
    );
    const latestModified = nodes.reduce(
      (max, child) => Math.max(max, computeDirectoryLastModified(child)),
      0,
    );
    addItem({
      provider,
      bucketName,
      pathName,
      name,
      type: "directory",
      children: [],
      _Object: {
        Size: totalSize || undefined,
        LastModified: latestModified ? new Date(latestModified) : undefined,
      } as TreeNode["_Object"],
    });
  }, [provider, bucketName, pathName, name, addItem, nodes]);

  if (nodes.length === 0) {
    return null;
  }

  return (
<<<<<<< HEAD
    <Section>
      <SectionHeader name={name}>{children}</SectionHeader>
=======
    <>
      <Container>
        <header className="flex flex-col justify-between mb-8 gap-2">
          <div className="flex gap-2">
            {name && (
              <h1 className="flex-grow font-bold text-2xl sm:text-3xl md:text-4xl">
                {name}
              </h1>
            )}
            <ViewModeToggle />
          </div>
          <div>
            {!bucketName && (
              <ButtonLink
                href="/connect-bucket"
                variant="secondary"
                iconLeft={Plug}
              >
                Connect Storage
              </ButtonLink>
            )}
>>>>>>> 0998c12 (fix: restore H1 responsive sizing and ViewModeToggle styling)

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
