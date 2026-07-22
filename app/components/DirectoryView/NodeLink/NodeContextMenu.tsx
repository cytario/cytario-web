import { IconButton, Menu, MenuItem, MenuSeparator } from "@cytario/design";
import { type ReactNode, useRef, useState } from "react";
import { Form } from "react-router";

import { ConfirmDialog } from "~/components/ConfirmDialog";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useModal } from "~/hooks/useModal";
import { useFavorite } from "~/routes/favorites/useFavorite";
import { toastBridge } from "~/toast-bridge";
import { canModify } from "~/utils/authorization";
import { resolveResourceId, select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { buildConnectionPath } from "~/utils/resourceId";

/**
 * Trailing context menu for a `TreeNode` (bucket, directory, file). All node
 * types share Open / Open in new tab / Copy S3 URI / favorite; buckets also
 * expose Edit and Delete when the user may modify the connection. Callers can
 * append caller-specific `MenuItem`s via `extraItems` (e.g. the viewer's
 * "Remove overlay"), rendered after a trailing separator.
 */
export const NodeContextMenu = ({
  node,
  isCurrent = false,
  extraItems,
}: {
  node: TreeNode;
  isCurrent?: boolean;
  extraItems?: ReactNode;
}) => {
  const isBucket = node.type === "bucket";
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const reapplyFormRef = useRef<HTMLFormElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const { openModal } = useModal();

  const { isFavorite, isPending: favoritePending, toggle: toggleFavorite } = useFavorite(node);

  const connection = useConnectionsStore(select.connection(node.connectionId ?? ""));
  const connectionConfig = connection?.connectionConfig;

  const user = useCurrentUser();

  const to = buildConnectionPath(node.connectionId ?? "", node.pathName);

  if (!connectionConfig) return null;

  const userCanModify =
    isBucket && user && connectionConfig ? canModify(user, connectionConfig) : false;

  // Offer Share only on a folder whose connection's provider role permits onward
  // sharing. The `allowsSharing` gate here is advisory UI; the
  // authoritative grant authorization runs server-side.
  const isFolder = node.type === "directory" || node.type === "bucket";
  const canShare = isFolder && (connection?.provider?.allowsSharing ?? false);

  const copyS3Uri = async () => {
    try {
      const { s3Uri } = resolveResourceId(node.id);
      await navigator.clipboard.writeText(s3Uri);
      toastBridge.emit({ variant: "success", message: "S3 URI copied to clipboard" });
    } catch {
      toastBridge.emit({ variant: "error", message: "Could not copy the S3 URI" });
    }
  };

  return (
    <>
      <Menu
        content={
          <>
            {!isCurrent && (
              <MenuItem id="open" icon="ArrowRight" href={to}>
                Open
              </MenuItem>
            )}
            <MenuItem id="open-new-tab" icon="ExternalLink" href={to} target="_blank">
              Open in new tab
            </MenuItem>
            <MenuSeparator />
            <MenuItem id="copy-s3-uri" icon="Copy" onAction={copyS3Uri}>
              Copy S3 URI
            </MenuItem>
            <MenuItem
              id="cyberduck"
              icon="Download"
              onAction={() => openModal("cyberduck", { connectionId: node.connectionId ?? "" })}
            >
              Access with Cyberduck
            </MenuItem>
            <MenuItem
              id="favorite"
              icon={isFavorite ? "BookmarkCheck" : "Bookmark"}
              isDisabled={favoritePending}
              onAction={toggleFavorite}
            >
              {isFavorite ? "Remove Favorite" : "Add Favorite"}
            </MenuItem>
            {canShare && (
              <MenuItem
                id="share"
                icon="Send"
                onAction={() =>
                  openModal("share-folder", {
                    connectionId: node.connectionId ?? "",
                    nodePath: node.pathName,
                  })
                }
              >
                Share
              </MenuItem>
            )}
            {userCanModify && (
              <>
                <MenuSeparator />
                {(connectionConfig.bucketPolicyStatus === "drifted" ||
                  connectionConfig.bucketPolicyStatus === "error") && (
                  <MenuItem
                    id="reapply"
                    icon="RotateCcw"
                    onAction={() => reapplyFormRef.current?.requestSubmit()}
                  >
                    Re-apply bucket policy
                  </MenuItem>
                )}
                <MenuItem
                  id="edit"
                  icon="Pencil"
                  onAction={() =>
                    openModal("edit-connection", { connectionId: node.connectionId ?? "" })
                  }
                >
                  Edit
                </MenuItem>
                <MenuItem
                  id="delete"
                  icon="Trash2"
                  isDanger
                  textValue="Delete connection"
                  onAction={() => {
                    focusReturnRef.current = document.activeElement as HTMLElement | null;
                    setConfirmOpen(true);
                  }}
                >
                  Delete
                </MenuItem>
              </>
            )}
            {extraItems && (
              <>
                <MenuSeparator />
                {extraItems}
              </>
            )}
          </>
        }
      >
        <IconButton
          icon="EllipsisVertical"
          label={`Actions for ${node.name}`}
          variant="ghost"
          size="xs"
        />
      </Menu>

      {isBucket && (
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
      )}
    </>
  );
};
