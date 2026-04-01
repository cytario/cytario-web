import { Button, ButtonLink } from "@cytario/design";
import { useCallback, useRef, useState } from "react";
import {
  Form,
  useRouteLoaderData,
  useSearchParams,
} from "react-router";

import type { UserProfile } from "~/.server/auth/getUserInfo";
import { ConfirmDialog } from "~/components/ConfirmDialog";
import { ProviderPill } from "~/components/Pills/ProviderPill";
import { VisibilityPill } from "~/components/Pills/VisibilityPill";
import { RouteModal } from "~/components/RouteModal";
import { useModal } from "~/hooks/useModal";
import { canModify } from "~/utils/authorization";
import { useConnectionsStore } from "~/utils/connectionsStore";

export default function ConnectionInfoModal({
  onClose,
}: {
  onClose: (extraKeys?: string[]) => void;
}) {
  const [searchParams] = useSearchParams();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { openModal } = useModal();

  const nodeName = searchParams.get("nodeName");
  const connectionConfig = useConnectionsStore((state) =>
    nodeName ? state.connections[nodeName]?.connectionConfig : undefined,
  );

  const rootData = useRouteLoaderData("root") as
    | { user?: UserProfile }
    | undefined;
  const user = rootData?.user;

  const handleClose = useCallback(() => {
    onClose(["nodeName"]);
  }, [onClose]);

  if (!nodeName || !connectionConfig) return null;

  const { provider, ownerScope } = connectionConfig;
  const userCanModify = user ? canModify(user, ownerScope) : false;

  return (
    <RouteModal title={nodeName} onClose={handleClose}>
      <div className="flex flex-col gap-4">
        {/* Connection details */}
        <dl className="flex flex-col gap-2 text-sm">
          {provider && (
            <div className="flex items-center justify-between">
              <dt className="text-(--color-text-secondary)">Provider</dt>
              <dd>
                <ProviderPill provider={provider} />
              </dd>
            </div>
          )}
          <div className="flex items-center justify-between">
            <dt className="text-(--color-text-secondary)">Visibility</dt>
            <dd>
              <VisibilityPill scope={ownerScope} />
            </dd>
          </div>
        </dl>

        {/* Edit Connection */}
        {userCanModify && (
          <Button
            variant="secondary"
            onPress={() => openModal("edit-connection", { nodeName })}
          >
            Edit Connection
          </Button>
        )}

        {/* Open Connection */}
        <ButtonLink href={`/connections/${nodeName}`} variant="secondary">
          Open Connection
        </ButtonLink>

        {/* Remove Connection */}
        <Form
          method="delete"
          action="/connections"
          ref={formRef}
          className="flex flex-col"
        >
          <input type="hidden" name="connectionName" value={nodeName} />
          <Button
            type="button"
            variant="destructive"
            onPress={() => setConfirmOpen(true)}
          >
            Remove Storage Connection
          </Button>
        </Form>

        <ConfirmDialog
          open={confirmOpen}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => formRef.current?.requestSubmit()}
          title="Remove connection?"
          confirmLabel="Remove"
        >
          <p>
            This will remove <strong>{nodeName}</strong> and its associated
            recents and pins. The underlying storage is not affected.
          </p>
        </ConfirmDialog>
      </div>
    </RouteModal>
  );
}
