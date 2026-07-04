import { useSearchParams } from "react-router";

import { ConnectionForm } from "./connection.form";
import { RouteModal } from "~/components/RouteModal";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

export default function UpdateConnectionModal({
  onClose,
}: {
  onClose: (extraKeys?: string[]) => void;
}) {
  const [searchParams] = useSearchParams();
  const nodeName = searchParams.get("nodeName");

  const connectionConfig = useConnectionsStore((state) =>
    nodeName ? state.connections[nodeName]?.connectionConfig : undefined,
  );

  const user = useCurrentUser();

  if (!user || !nodeName || !connectionConfig) return null;

  const { bucketName, prefix, scope, providerConnectionId, providerRoleId } = connectionConfig;

  const initialData = {
    originalName: nodeName,
    name: nodeName,
    scope,
    providerConnectionId,
    providerRoleId,
    bucketName,
    prefix,
  };

  return (
    <RouteModal title="Edit Connection" onClose={() => onClose(["nodeName"])}>
      <ConnectionForm adminScopes={user.adminScopes} userId={user.sub} initialData={initialData} />
    </RouteModal>
  );
}
