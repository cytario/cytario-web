import { MenuItem, MenuSeparator } from "@cytario/design";
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
 * Context-menu content for a `TreeNode` (bucket, directory, file), for driving
 * `useContextMenu`. All node types share Open / Open in new tab / Copy S3 URI /
 * favorite; buckets also expose Edit and Delete when the user may modify the
 * connection. Callers can append caller-specific `MenuItem`s via `extraItems`
 * (e.g. the viewer's "Remove overlay"), rendered after a trailing separator.
 *
 * Returns the menu `content` and a `dialog` (the delete-confirm portal for
 * buckets) that the consumer renders alongside the menu.
 */
export const useNodeContextMenu = ({
  node,
  isCurrent = false,
  extraItems,
}: {
  node: TreeNode;
  isCurrent?: boolean;
  extraItems?: ReactNode;
}): { content: ReactNode; dialog: ReactNode } => {
  const isBucket = node.type === "bucket";
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const { openModal } = useModal();

  const { isFavorite, isPending: favoritePending, toggle: toggleFavorite } = useFavorite(node);

  const connectionConfig = useConnectionsStore(select.connectionConfig(node.connectionName));

  const user = useCurrentUser();

  const to = buildConnectionPath(node.connectionName, node.pathName);

  if (!connectionConfig) return { content: null, dialog: null };

  const userCanModify =
    isBucket && user && connectionConfig ? canModify(user, connectionConfig) : false;

  const copyS3Uri = async () => {
    try {
      const { s3Uri } = resolveResourceId(node.id);
      await navigator.clipboard.writeText(s3Uri);
      toastBridge.emit({ variant: "success", message: "S3 URI copied to clipboard" });
    } catch {
      toastBridge.emit({ variant: "error", message: "Could not copy the S3 URI" });
    }
  };

  const content = (
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
        onAction={() => openModal("cyberduck", { connectionName: node.connectionName })}
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
      {userCanModify && (
        <>
          <MenuSeparator />
          <MenuItem
            id="edit"
            icon="Pencil"
            onAction={() => openModal("edit-connection", { nodeName: node.name })}
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
  );

  const dialog = isBucket ? (
    <>
      <Form method="delete" action="/connections" ref={formRef} className="hidden">
        <input type="hidden" name="connectionName" value={node.name} />
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

  return { content, dialog };
};
