import { Button, ButtonLink } from "@cytario/design";
import { useCallback, useRef, useState } from "react";
import { Form, useSearchParams } from "react-router";

import { ConfirmDialog } from "~/components/ConfirmDialog";
import { ScopePill } from "~/components/Pill/Pill";
import { RouteModal } from "~/components/RouteModal";
import { useConnectionsStore } from "~/utils/connectionsStore";

export default function ConnectionInfoModal({
  onClose,
}: {
  onClose: (extraKeys?: string[]) => void;
}) {
  const [searchParams] = useSearchParams();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const nodeName = searchParams.get("nodeName");
  const connectionConfig = useConnectionsStore((state) =>
    nodeName ? state.connections[nodeName]?.connectionConfig : undefined,
  );

  const handleClose = useCallback(() => {
    onClose(["nodeName"]);
  }, [onClose]);

  if (!nodeName || !connectionConfig) return null;

  const { provider, ownerScope } = connectionConfig;

  return (
    <RouteModal title={nodeName} onClose={handleClose}>
      <div className="flex flex-col gap-4">
        {/* Connection details */}
        <dl className="flex flex-col gap-2 text-sm">
          {ownerScope && (
            <div className="flex items-center justify-between">
              <dt className="text-(--color-text-secondary)">Visibility</dt>
              <dd>
                <ScopePill ownerScope={ownerScope} />
              </dd>
            </div>
          )}
          {provider && (
            <div className="flex items-center justify-between">
              <dt className="text-(--color-text-secondary)">Provider</dt>
              <dd className="font-medium text-(--color-text-primary)">
                <ScopePill ownerScope={provider} />
              </dd>
            </div>
          )}
        </dl>

        {/* Open Connection */}
        <ButtonLink href={`/connections/${nodeName}`} variant="secondary">
          Open Connection
        </ButtonLink>

        {/* Remove Connection */}
        <Form method="delete" action="/connections" ref={formRef}>
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
