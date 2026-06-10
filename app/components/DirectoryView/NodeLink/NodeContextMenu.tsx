import { IconButton, Menu, MenuItem, MenuSeparator } from "@cytario/design";
import { ArrowRight, EllipsisVertical, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Form, useRouteLoaderData } from "react-router";

import type { UserProfile } from "~/.server/auth/getUserInfo";
import { ConfirmDialog } from "~/components/ConfirmDialog";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { useModal } from "~/hooks/useModal";
import { canModify } from "~/utils/authorization";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { buildConnectionPath } from "~/utils/resourceId";

/**
 * Trailing context menu shown for every `TreeNode` (bucket, directory, file).
 * All node types share Open / Open in new tab; buckets additionally expose
 * Edit and Delete when the user may modify the connection.
 */
export const NodeContextMenu = ({ node }: { node: TreeNode }) => {
  const isBucket = node.type === "bucket";
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const { openModal } = useModal();

  const to = buildConnectionPath(node.connectionName, node.pathName);

  const connectionConfig = useConnectionsStore(select.connectionConfig(node.connectionName));
  const rootData = useRouteLoaderData("root") as { user?: UserProfile } | undefined;
  const user = rootData?.user;
  const userCanModify =
    isBucket && user && connectionConfig ? canModify(user, connectionConfig) : false;

  return (
    <>
      <Menu
        content={
          <>
            <MenuItem id="open" icon={ArrowRight} href={to}>
              Open
            </MenuItem>
            <MenuItem id="open-new-tab" icon={ExternalLink} href={to} target="_blank">
              Open in new tab
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
          icon={EllipsisVertical}
          aria-label={`Actions for ${node.name}`}
          variant="ghost"
          size="sm"
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
