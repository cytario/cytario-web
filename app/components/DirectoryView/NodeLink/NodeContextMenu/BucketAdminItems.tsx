import { MenuSeparator, MenuItem } from "@cytario/design";
import { type RefObject } from "react";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useModal } from "~/hooks/useModal";
import { canModify } from "~/utils/authorization";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

/**
 * Bucket admin menu items (Re-apply / Edit / Delete). Menu items only — the
 * hidden forms and the delete ConfirmDialog live in `useNodeContextMenu`'s
 * `dialogs` slot, OUTSIDE the popover: React-Aria unmounts menu content on
 * close, so anything that must outlive the selection (forms, dialogs, the
 * confirm state) cannot live here.
 */
export function BucketAdminItems({
  node,
  onOpenConfirm,
  reapplyFormRef,
}: {
  node: TreeNode;
  /** Captures the trigger's focus and opens the delete confirm dialog. */
  onOpenConfirm: () => void;
  /** Re-apply form rendered outside the popover; submitted imperatively. */
  reapplyFormRef: RefObject<HTMLFormElement | null>;
}) {
  const connection = useConnectionsStore(select.connection(node.connectionId));
  const connectionConfig = connection?.connectionConfig;
  const user = useCurrentUser();
  const { openModal } = useModal();

  if (node.type !== "bucket") return null;

  const userCanModify = user && connectionConfig ? canModify(user, connectionConfig) : false;
  if (!userCanModify || !connectionConfig) return null;

  const showReapply =
    connectionConfig.bucketPolicyStatus === "drifted" ||
    connectionConfig.bucketPolicyStatus === "error";

  return (
    <>
      <MenuSeparator />
      {showReapply && (
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
        onAction={onOpenConfirm}
      >
        Delete
      </MenuItem>
    </>
  );
}
