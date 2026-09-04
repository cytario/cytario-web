import { MenuSeparator, useContextMenu, UseContextMenuResult } from "@cytario/design";
import { type ReactNode, useRef, useState } from "react";
import { Form } from "react-router";

import { BucketAdminItems } from "./BucketAdminItems";
import { CopyS3UriMenuItem } from "./CopyS3UriMenuItem";
import { CyberduckMenuItem } from "./CyberduckMenuItem";
import { DownloadMenuItem } from "./DownloadMenuItem";
import { FavoriteMenuItem } from "./FavoriteMenuItem";
import { NavigationMenuItems } from "./NavigationMenuItems";
import { ShareMenuItem } from "./ShareMenuItem";
import { ConfirmDialog } from "~/components/ConfirmDialog";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { PluginContextMenuItems } from "~/components/DirectoryView/NodeLink/PluginContextMenuItems";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

export interface NodeContextMenuResult extends UseContextMenuResult {
  /**
   * Hidden forms + the delete ConfirmDialog. Rendered by NodeLink as a
   * SIBLING of `menu` — outside the popover, because React-Aria unmounts
   * menu content on close and the confirm flow must outlive the selection.
   */
  dialogs: ReactNode;
}

export function useNodeContextMenu({
  node,
  isCurrent = false,
  extraItems,
}: {
  node: TreeNode;
  isCurrent?: boolean;
  extraItems?: ReactNode;
}): NodeContextMenuResult | null {
  const connection = useConnectionsStore(select.connection(node.connectionId));
  const connectionConfig = connection?.connectionConfig;

  // Confirm-flow state: owned here (always mounted in NodeLink), never
  // inside the popover.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const reapplyFormRef = useRef<HTMLFormElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);

  const openConfirm = () => {
    focusReturnRef.current = document.activeElement as HTMLElement | null;
    setConfirmOpen(true);
  };

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
        <BucketAdminItems node={node} onOpenConfirm={openConfirm} reapplyFormRef={reapplyFormRef} />
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

  // Forms + confirm dialog, rendered outside the popover (see dialogs slot).
  // Ungated beyond bucket-ness: they only act when the matching (gated)
  // menu item fires, and rendering them for non-bucket nodes is harmless.
  const dialogs =
    node.type === "bucket" ? (
      <>
        <Form method="delete" action="/connections" ref={formRef} className="hidden">
          <input type="hidden" name="connectionId" value={connectionConfig.id} />
        </Form>
        <Form method="post" action="/connections" ref={reapplyFormRef} className="hidden">
          <input type="hidden" name="_intent" value="reapply" />
          <input type="hidden" name="connectionId" value={connectionConfig.id} />
        </Form>
        <ConfirmDialog
          open={confirmOpen}
          onCancel={() => {
            setConfirmOpen(false);
            requestAnimationFrame(() => focusReturnRef.current?.focus());
          }}
          onConfirm={() => formRef.current?.requestSubmit()}
          title="Remove connection?"
          confirmLabel="Remove"
        >
          <p>
            This will remove <strong>{node.name}</strong> and its associated recents and pins. The
            underlying storage is not affected.
          </p>
        </ConfirmDialog>
      </>
    ) : null;

  return { ...ctx, dialogs };
}
