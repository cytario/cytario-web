import { IconButton, Menu, MenuItem, MenuSeparator } from "@cytario/design";
import { EllipsisVertical, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Form, useRouteLoaderData } from "react-router";

import type { UserProfile } from "~/.server/auth/getUserInfo";
import { ConfirmDialog } from "~/components/ConfirmDialog";
import { useModal } from "~/hooks/useModal";
import { canModify } from "~/utils/authorization";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

interface ConnectionMenuProps {
  connectionName: string;
}

export function ConnectionMenu({ connectionName }: ConnectionMenuProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const { openModal } = useModal();

  const connectionConfig = useConnectionsStore(
    select.connectionConfig(connectionName),
  );

  const rootData = useRouteLoaderData("root") as
    | { user?: UserProfile }
    | undefined;
  const user = rootData?.user;
  const userCanModify =
    user && connectionConfig
      ? canModify(user, connectionConfig.ownerScope)
      : false;

  return (
    <>
      <Menu
        content={
          <>
            <MenuItem
              id="open"
              icon={ExternalLink}
              href={`/connections/${encodeURIComponent(connectionName)}`}
            >
              Open
            </MenuItem>
            {userCanModify && (
              <>
                <MenuItem
                  id="edit"
                  icon={Pencil}
                  onAction={() =>
                    openModal("edit-connection", { nodeName: connectionName })
                  }
                >
                  Edit
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  id="delete"
                  icon={Trash2}
                  isDanger
                  textValue="Delete connection"
                  onAction={() => {
                    focusReturnRef.current =
                      document.activeElement as HTMLElement | null;
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
          aria-label={`Actions for ${connectionName}`}
          variant="ghost"
          size="sm"
        />
      </Menu>

      <Form
        method="delete"
        action="/connections"
        ref={formRef}
        className="hidden"
      >
        <input type="hidden" name="connectionName" value={connectionName} />
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
          This will remove <strong>{connectionName}</strong> and its associated
          recents and pins. The underlying storage is not affected.
        </p>
      </ConfirmDialog>
    </>
  );
}
