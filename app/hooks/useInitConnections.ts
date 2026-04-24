import { Credentials } from "@aws-sdk/client-sts";
import { useEffect } from "react";

import { ConnectionConfig } from "~/.generated/client";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

/**
 * Replaces the client store with the authoritative set of connections from
 * the auth context. Runs on every route that calls it — missing connections
 * (deleted server-side) are pruned, new ones added. Safe to call repeatedly.
 */
export function useInitConnections(
  connectionConfigs: ConnectionConfig[],
  credentials: Record<string, Credentials>,
) {
  const reconcileConnections = useConnectionsStore(select.reconcileConnections);

  useEffect(() => {
    reconcileConnections(connectionConfigs, credentials);
  }, [connectionConfigs, credentials, reconcileConnections]);
}
