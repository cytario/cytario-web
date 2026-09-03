import { MenuItem, MenuSeparator } from "@cytario/design";
import { useRef, useState } from "react";
import { Form } from "react-router";

import { ConfirmDialog } from "~/components/ConfirmDialog";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useModal } from "~/hooks/useModal";
import { canModify } from "~/utils/authorization";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

export function BucketAdminItems({ node }: { node: TreeNode }) {
  const connection = useConnectionsStore(select.connection(node.connectionId));
  const connectionConfig = connection?.connectionConfig;
  const user = useCurrentUser();
  const { openModal } = useModal();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const reapplyFormRef = useRef<HTMLFormElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);

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
        onAction={() => {
          focusReturnRef.current = document.activeElement as HTMLElement | null;
          setConfirmOpen(true);
        }}
      >
        Delete
      </MenuItem>

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
  );
}
