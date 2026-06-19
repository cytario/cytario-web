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

  const { bucketName, prefix, provider, ownerScope, roleArn, region, endpoint } = connectionConfig;

  const s3Uri = prefix ? `${bucketName}/${prefix}` : bucketName;

  const initialData = {
    originalName: nodeName,
    name: nodeName,
    providerType: provider as "aws" | "minio",
    s3Uri,
    ownerScope,
    roleArn: roleArn ?? "",
    bucketRegion: region ?? "",
    bucketEndpoint: provider === "minio" ? endpoint : "",
  };

  return (
    <RouteModal title="Edit Connection" onClose={() => onClose(["nodeName"])}>
      <ConnectionForm adminScopes={user.adminScopes} userId={user.sub} initialData={initialData} />
    </RouteModal>
  );
}
