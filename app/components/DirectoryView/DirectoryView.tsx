import { ReactNode, useEffect } from "react";

import { DirectoryViewGrid } from "./DirectoryViewGrid";
import { DirectoryViewTable } from "./DirectoryViewTable";
import { NodeInfoModal } from "./NodeInfoModal";
import { H1 } from "../Fonts";
import { useDirectoryStore } from "./useDirectoryStore";
import { Container, Section } from "~/components/Container";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { Placeholder } from "~/components/Placeholder";
import { useRecentlyViewedStore } from "~/utils/recentlyViewedStore/useRecentlyViewedStore";

export interface DirectoryViewBaseProps {
  nodes: TreeNode[];
  provider?: string;
  bucketName: string;
  pathName?: string;
}

interface DirectoryViewProps extends DirectoryViewBaseProps {
  name: string;
  children?: ReactNode;
}

export function DirectoryView({
  nodes,
  name,
  provider,
  bucketName,
  pathName,
  children,
}: DirectoryViewProps) {
  const { viewMode, setProvider, setBucketName, setPathName } =
    useDirectoryStore();

  const { addItem } = useRecentlyViewedStore();

  useEffect(() => {
    if (provider) setProvider(provider);
    setBucketName(bucketName);
    setPathName(pathName);

    // Track browsed directories (skip bucket-level landing page)
    if (provider && bucketName && pathName) {
      addItem({
        provider,
        bucketName,
        pathName,
        name,
        type: "directory",
        children: [],
      });
    }
  }, [
    provider,
    bucketName,
    pathName,
    name,
    setProvider,
    setBucketName,
    setPathName,
    addItem,
  ]);

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
      <Container>
        <header className="flex flex-col justify-between mb-8 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {name && <H1 className="flex-grow">{name}</H1>}
            {children}
          </div>
        </header>
      </Container>

      <Container wide={viewMode === "list-wide"}>
        {viewMode === "list" || viewMode === "list-wide" ? (
          <DirectoryViewTable nodes={nodes} />
        ) : (
          <DirectoryViewGrid nodes={nodes} viewMode={viewMode} />
        )}
      </Container>

      <NodeInfoModal />
    </Section>
  );
}
