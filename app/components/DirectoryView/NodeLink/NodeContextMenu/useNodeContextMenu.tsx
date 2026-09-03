import { IconButton, MenuSeparator, useContextMenu } from "@cytario/design";
import { type ReactNode } from "react";

import { BucketAdminItems } from "./BucketAdminItems";
import { CopyS3UriMenuItem } from "./CopyS3UriMenuItem";
import { CyberduckMenuItem } from "./CyberduckMenuItem";
import { DownloadMenuItem } from "./DownloadMenuItem";
import { FavoriteMenuItem } from "./FavoriteMenuItem";
import { NavigationMenuItems } from "./NavigationMenuItems";
import { ShareMenuItem } from "./ShareMenuItem";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { PluginContextMenuItems } from "~/components/DirectoryView/NodeLink/PluginContextMenuItems";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

export interface UseNodeContextMenuResult {
  targetProps: { onContextMenu: (event: React.MouseEvent) => void };
  kebab: ReactNode;
  menu: ReactNode;
}

export function useNodeContextMenu({
  node,
  isCurrent = false,
  extraItems,
}: {
  node: TreeNode;
  isCurrent?: boolean;
  extraItems?: ReactNode;
}): UseNodeContextMenuResult | null {
  const connection = useConnectionsStore(select.connection(node.connectionId));
  const connectionConfig = connection?.connectionConfig;

  const ctx = useContextMenu({
    content: connectionConfig ? (
      <>
        <NavigationMenuItems node={node} isCurrent={isCurrent} />
        <CopyS3UriMenuItem node={node} />
        <DownloadMenuItem node={node} />
        <CyberduckMenuItem node={node} />
        <FavoriteMenuItem node={node} />
        <ShareMenuItem node={node} />
        <BucketAdminItems node={node} />
        {extraItems && (
          <>
            <MenuSeparator />
            {extraItems}
          </>
        )}
        <PluginContextMenuItems node={node} />
      </>
    ) : null,
  });

  if (!connectionConfig) return null;

  const kebab = (
    <IconButton
      icon="EllipsisVertical"
      label={`Actions for ${node.name}`}
      variant="ghost"
      size="xs"
      {...ctx.triggerProps}
    />
  );

  return { targetProps: ctx.targetProps, kebab, menu: ctx.menu };
}
