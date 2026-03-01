import { StorageConnectionCard } from "@cytario/design";
import { ReactNode, useCallback } from "react";
import { useLocation, useNavigate } from "react-router";

import { BucketConfig } from "~/.generated/client";
import { Container, Section, SectionHeader } from "~/components/Container";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { NodeInfoModal } from "~/components/DirectoryView/NodeInfoModal";
import { createResourceId } from "~/utils/resourceId";

interface StorageConnectionCardItemProps {
  node: TreeNode;
  config: BucketConfig | undefined;
}

function StorageConnectionCardItem({
  node,
  config,
}: StorageConnectionCardItemProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const resourceId = createResourceId(
    node.provider,
    node.bucketName,
    node.pathName,
  );
  const href = `/buckets/${resourceId}`.replace(/\/$/, "");

  const handlePress = useCallback(() => {
    navigate(href);
  }, [navigate, href]);

  const openNodeInfoModal = useCallback(() => {
    const search = new URLSearchParams(location.search);
    search.set("bucket", resourceId);

    navigate({
      pathname: location.pathname,
      search: `?${search.toString()}`,
    });
  }, [resourceId, location.pathname, location.search, navigate]);

  return (
    <StorageConnectionCard
      name={node.name}
      provider={node.provider}
      region={config?.region ?? undefined}
      status="connected"
      onPress={handlePress}
      onInfo={openNodeInfoModal}
    />
  );
}

interface StorageConnectionsGridProps {
  nodes: TreeNode[];
  bucketConfigs: BucketConfig[];
  name: string;
  children?: ReactNode;
}

export function StorageConnectionsGrid({
  nodes,
  bucketConfigs,
  name,
  children,
}: StorageConnectionsGridProps) {
  if (nodes.length === 0) {
    return null;
  }

  const configByKey = new Map(
    bucketConfigs.map((c) => [`${c.provider}/${c.name}`, c]),
  );

  return (
    <Section>
      <SectionHeader name={name}>{children}</SectionHeader>

      <Container>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {nodes.map((node) => {
            const key = `${node.provider}/${node.bucketName}/${node.pathName ?? ""}`;
            return (
              <StorageConnectionCardItem
                key={key}
                node={node}
                config={configByKey.get(`${node.provider}/${node.bucketName}`)}
              />
            );
          })}
        </div>
      </Container>

      <NodeInfoModal />
    </Section>
  );
}
