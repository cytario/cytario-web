import { IconButton, Menu, MenuItem, MenuSeparator } from "@cytario/design";
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  Pencil,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { Form, useRouteLoaderData } from "react-router";

import type { UserProfile } from "~/.server/auth/getUserInfo";
import { ConfirmDialog } from "~/components/ConfirmDialog";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
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
 * expose Edit and Delete when the user may modify the connection.
 */
export const NodeContextMenu = ({
  node,
  triggerVariant = "ghost",
  isCurrent = false,
}: {
  node: TreeNode;
  triggerVariant?: "ghost" | "secondary";
  isCurrent?: boolean;
}) => {
  const isBucket = node.type === "bucket";
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const { openModal } = useModal();

  const { isFavorite, isPending: favoritePending, toggle: toggleFavorite } = useFavorite(node);

  const connectionConfig = useConnectionsStore(select.connectionConfig(node.connectionName));

  const rootData = useRouteLoaderData("root") as { user?: UserProfile } | undefined;

  if (!connectionConfig) return null;

  const user = rootData?.user;
  const userCanModify =
    isBucket && user && connectionConfig ? canModify(user, connectionConfig) : false;

  const to = buildConnectionPath(node.connectionName, node.pathName);

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
              <MenuItem id="open" icon={ArrowRight} href={to}>
                Open
              </MenuItem>
            )}
            <MenuItem id="open-new-tab" icon={ExternalLink} href={to} target="_blank">
              Open in new tab
            </MenuItem>
            <MenuSeparator />
            <MenuItem id="copy-s3-uri" icon={Copy} onAction={copyS3Uri}>
              Copy S3 URI
            </MenuItem>
            <MenuItem
              id="cyberduck"
              icon={Download}
              onAction={() => openModal("cyberduck", { connectionName: node.connectionName })}
            >
              Access with Cyberduck
            </MenuItem>
            <MenuItem
              id="favorite"
              icon={isFavorite ? BookmarkCheck : Bookmark}
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
                  icon={Pencil}
                  onAction={() => openModal("edit-connection", { nodeName: node.name })}
                >
                  Edit
                </MenuItem>
                <MenuItem
                  id="delete"
                  icon={Trash2}
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
          </>
        }
      >
        <IconButton
          icon={Ellipsis}
          aria-label={`Actions for ${node.name}`}
          variant={triggerVariant}
          size="xs"
        />
      </Menu>

      {isBucket && (
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
      )}
    </>
  );
};
