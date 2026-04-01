import { Button, ButtonLink, Select } from "@cytario/design";
import { useCallback, useRef, useState } from "react";
import {
  Form,
  useFetcher,
  useRouteLoaderData,
  useSearchParams,
} from "react-router";

import type { UserProfile } from "~/.server/auth/getUserInfo";
import { ConfirmDialog } from "~/components/ConfirmDialog";
import { ProviderPill } from "~/components/Pills/ProviderPill";
import { formatVisibilityLabel, VisibilityPill } from "~/components/Pills/VisibilityPill";
import { RouteModal } from "~/components/RouteModal";
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

  const nodeName = searchParams.get("nodeName");
  const connectionConfig = useConnectionsStore((state) =>
    nodeName ? state.connections[nodeName]?.connectionConfig : undefined,
  );

  const rootData = useRouteLoaderData("root") as
    | { user?: UserProfile }
    | undefined;
  const user = rootData?.user;

  const fetcher = useFetcher<{ error?: string; status?: string }>();
  const fetcherError =
    fetcher.data?.status === "error" ? fetcher.data.error : undefined;

  const handleClose = useCallback(() => {
    onClose(["nodeName"]);
  }, [onClose]);

  if (!nodeName || !connectionConfig) return null;

  const { provider, ownerScope } = connectionConfig;
  const userCanModify = user ? canModify(user, ownerScope) : false;

  const scopeItems = user
    ? [
        { id: user.sub, name: "Personal" },
        ...user.adminScopes.map((s) => ({ id: s, name: formatVisibilityLabel(s) })),
      ]
    : [];

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
              {userCanModify && scopeItems.length > 1 ? (
                <ScopeEditor
                  connectionName={nodeName}
                  currentScope={ownerScope}
                  scopeItems={scopeItems}
                  fetcher={fetcher}
                  error={fetcherError}
                />
              ) : (
                <VisibilityPill scope={ownerScope} />
              )}
            </dd>
          </div>
        </dl>

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

function ScopeEditor({
  connectionName,
  currentScope,
  scopeItems,
  fetcher,
  error,
}: {
  connectionName: string;
  currentScope: string;
  scopeItems: { id: string; name: string }[];
  fetcher: ReturnType<typeof useFetcher>;
  error?: string;
}) {
  const [selectedScope, setSelectedScope] = useState(currentScope);
  const isDirty = selectedScope !== currentScope;

  const handleSave = () => {
    fetcher.submit(
      { connectionName, newOwnerScope: selectedScope },
      { method: "PATCH", action: "/connections" },
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Select
          items={scopeItems}
          selectedKey={selectedScope}
          onSelectionChange={(key) => setSelectedScope(String(key))}
          renderItem={(item) => <VisibilityPill scope={item.id} />}
        />
        {isDirty && (
          <Button
            size="sm"
            onPress={handleSave}
            isDisabled={fetcher.state !== "idle"}
          >
            Save
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-(--color-text-danger)">{error}</p>}
    </div>
  );
}
