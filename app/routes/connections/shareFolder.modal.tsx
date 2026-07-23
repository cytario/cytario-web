import { useSearchParams } from "react-router";

import { RouteModal } from "~/components/RouteModal";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { ShareFolderForm } from "~/routes/connections/shareFolder.form";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

/**
 * Share Folder modal. Bucket, provider connection, and prefix are
 * taken from the folder context and are not editable; the user enters only a name,
 * a target group scope, and a provider role.
 */
export default function ShareFolderModal({ onClose }: { onClose: (extraKeys?: string[]) => void }) {
  const [searchParams] = useSearchParams();
  const connectionId = searchParams.get("connectionId");
  const nodePath = searchParams.get("nodePath") ?? "";

  const user = useCurrentUser();
  const connectionConfig = useConnectionsStore(
    connectionId ? select.connectionConfig(connectionId) : () => undefined,
  );

  const close = () => onClose(["connectionId", "nodePath"]);

  if (!user || !connectionId || !connectionConfig) return null;

  // The shared prefix is the connection's own prefix joined with the folder's
  // connection-relative path.
  const basePrefix = connectionConfig.prefix ? connectionConfig.prefix.replace(/\/$/, "") : "";
  const folderPrefix = [basePrefix, nodePath.replace(/\/+$/, "")].filter(Boolean).join("/");

  return (
    <RouteModal title="Share Folder" onClose={close}>
      <ShareFolderForm
        adminScopes={user.adminScopes}
        bucketName={connectionConfig.bucketName}
        providerConnectionId={connectionConfig.providerConnectionId}
        prefix={folderPrefix}
        onClose={close}
      />
    </RouteModal>
  );
}
