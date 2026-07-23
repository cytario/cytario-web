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
  const connectionId = searchParams.get("connectionId");

  const connectionConfig = useConnectionsStore((state) =>
    connectionId ? state.connections[connectionId]?.connectionConfig : undefined,
  );

  const user = useCurrentUser();

  if (!user || !connectionId || !connectionConfig) return null;

  const { name, bucketName, prefix, providerConnectionId, grants } = connectionConfig;

  const initialData = {
    connectionId,
    name,
    providerConnectionId,
    bucketName,
    prefix,
    grants: (grants ?? []).map((g) => ({
      scope: g.scope,
      providerRoleId: g.providerRoleId,
    })),
  };

  return (
    <RouteModal title="Edit Connection" onClose={() => onClose(["connectionId"])}>
      <ConnectionForm adminScopes={user.adminScopes} userId={user.sub} initialData={initialData} />
    </RouteModal>
  );
}
