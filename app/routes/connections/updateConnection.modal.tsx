import { useRouteLoaderData, useSearchParams } from "react-router";

import { ConnectionForm } from "./connection.form";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { RouteModal } from "~/components/RouteModal";
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

  const rootData = useRouteLoaderData("root") as
    | { user?: UserProfile }
    | undefined;
  const user = rootData?.user;

  if (!user || !nodeName || !connectionConfig) return null;

  const { bucketName, prefix, provider, ownerScope, roleArn, region, endpoint } =
    connectionConfig;

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
    <RouteModal
      title="Edit Connection"
      onClose={() => onClose(["nodeName"])}
    >
      <ConnectionForm
        adminScopes={user.adminScopes}
        userId={user.sub}
        initialData={initialData}
      />
    </RouteModal>
  );
}
