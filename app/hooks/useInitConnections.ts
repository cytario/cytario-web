import { Credentials } from "@aws-sdk/client-sts";
import { useEffect } from "react";

import { ConnectionConfig } from "~/.generated/client";
import { probeIndex } from "~/utils/connectionIndex";
import { select, useConnectionsStore } from "~/utils/connectionsStore";

/**
 * Stores credentials and config for all connections in the Zustand store,
 * then probes each connection's index status.
 * Safe to call from multiple routes -- idempotent per alias.
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
