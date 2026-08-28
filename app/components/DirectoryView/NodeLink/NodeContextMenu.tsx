import { Icon, IconButton, Menu, MenuItem, MenuSeparator, Tooltip } from "@cytario/design";
import { type ReactNode, useRef, useState } from "react";
import { Form } from "react-router";

import { ConfirmDialog } from "~/components/ConfirmDialog";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { PluginContextMenuItems } from "~/components/DirectoryView/NodeLink/PluginContextMenuItems";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useModal } from "~/hooks/useModal";
import { useFavorite } from "~/routes/favorites/useFavorite";
import { toastBridge } from "~/toast-bridge";
import { canModify } from "~/utils/authorization";
import { resolveResourceId, select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { getUint8ArrayForResourceId } from "~/utils/db/getBlobFromObjectNode";
import { buildConnectionPath } from "~/utils/resourceId";

/** Above this object size the in-browser download path is withheld — it
 * buffers the full body into a Uint8Array + Blob (2× heap) and caches it in
 * IndexedDB, which OOMs the tab on large objects. */
const MAX_DOWNLOADABLE_SIZE = 256 * 1024 * 1024;

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

  const connection = useConnectionsStore(select.connection(node.connectionId));
  const connectionConfig = connection?.connectionConfig;

  const user = useCurrentUser();

  const to = buildConnectionPath(node.connectionId, node.pathName);

  if (!connectionConfig) return null;

  const userCanModify =
    isBucket && user && connectionConfig ? canModify(user, connectionConfig) : false;

  // Offer Share only on a folder whose connection's provider role permits onward
  // sharing. The `allowsSharing` gate here is advisory UI; the
  // authoritative grant authorization runs server-side.
  const isFolder = node.type === "directory" || node.type === "bucket";
  const canShare = isFolder && (connection?.provider?.allowsSharing ?? false);

  const isFile = node.type === "file";
  const fileSize = isFile ? node._Object?.Size : undefined;
  const tooLargeForDownload = fileSize !== undefined && fileSize > MAX_DOWNLOADABLE_SIZE;
  const canDownload = isFile && fileSize !== undefined && !tooLargeForDownload;

  const copyS3Uri = async () => {
    try {
      const { s3Uri } = resolveResourceId(node.id);
      await navigator.clipboard.writeText(s3Uri);
      toastBridge.emit({ variant: "success", message: "S3 URI copied to clipboard" });
    } catch {
      toastBridge.emit({ variant: "error", message: "Could not copy the S3 URI" });
    }
  };

  const handleDownload = async () => {
    try {
      const data = await getUint8ArrayForResourceId(node.id);
      const blob = new Blob([data.slice()]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = node.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toastBridge.emit({ variant: "success", message: `Downloaded ${node.name}` });
    } catch (error) {
      console.error("Download failed", error);
      toastBridge.emit({ variant: "error", message: `Could not download ${node.name}` });
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
            {isFile && canDownload && (
              <MenuItem id="download" icon="Download" onAction={handleDownload}>
                Download
              </MenuItem>
            )}
            {isFile && tooLargeForDownload && (
              <MenuItem
                id="download"
                icon="Download"
                isDisabled
                endContent={
                  <Tooltip content="File too large for in-browser download (max 256 MB)">
                    <span className="pointer-events-auto">
                      <Icon icon="Info" size="sm" />
                    </span>
                  </Tooltip>
                }
              >
                Download
              </MenuItem>
            )}
            <MenuItem
              id="cyberduck"
              icon="Download"
              onAction={() => openModal("cyberduck", { connectionId: node.connectionId })}
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
                    connectionId: node.connectionId,
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
                  onAction={() => openModal("edit-connection", { connectionId: node.connectionId })}
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
            <PluginContextMenuItems node={node} />
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
