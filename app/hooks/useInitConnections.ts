import { Credentials } from "@aws-sdk/client-sts";
import { useEffect } from "react";

import { ConnectionConfig } from "~/.generated/client";
import { select, useConnectionsStore } from "~/utils/connectionsStore";

/**
 * Stores credentials and config for all connections in the Zustand store.
 * Safe to call from multiple routes -- idempotent per connection name.
 */
export function useInitConnections(
  connectionConfigs: ConnectionConfig[],
  credentials: Record<string, Credentials>,
) {
  const setConnection = useConnectionsStore(select.setConnection);

  useEffect(() => {
    for (const config of connectionConfigs) {
      const creds = credentials[config.bucketName];
      if (!creds) continue;

      setConnection(creds, config);
    }
  }, [credentials, connectionConfigs, setConnection]);
}
