import { Credentials } from "@aws-sdk/client-sts";
import { useEffect } from "react";

import { ConnectionConfig } from "~/.generated/client";
import { probeIndex } from "~/utils/connectionIndex";
import { select, useConnectionsStore } from "~/utils/connectionsStore";

/**
 * Stores credentials for all connections and probes their indexes in
 * parallel. Safe to call from multiple routes — probeIndex is a no-op if a
 * connection is already loading or ready.
 */
export function useInitConnections(
  connectionConfigs: ConnectionConfig[],
  credentials: Record<string, Credentials>,
) {
  const setConnection = useConnectionsStore(select.setConnection);

  useEffect(() => {
    for (const config of connectionConfigs) {
      const creds = credentials[config.name];
      if (!creds) continue;

      setConnection(config.alias, creds, config);
      probeIndex(config.alias);
    }
  }, [credentials, connectionConfigs, setConnection]);
}
