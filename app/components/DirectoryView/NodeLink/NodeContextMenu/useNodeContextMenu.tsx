import { MenuSeparator, useContextMenu, UseContextMenuResult } from "@cytario/design";
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

export function useNodeContextMenu({
  node,
  isCurrent = false,
  extraItems,
}: {
  node: TreeNode;
  isCurrent?: boolean;
  extraItems?: ReactNode;
}): UseContextMenuResult | null {
  const connection = useConnectionsStore(select.connection(node.connectionId));
  const connectionConfig = connection?.connectionConfig;

  const ctx = useContextMenu({
    label: `Actions for ${node.name}`,
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

  return ctx;
}
