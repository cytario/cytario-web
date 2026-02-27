import { Credentials } from "@aws-sdk/client-sts";
import { useEffect } from "react";

import { ConnectionConfig } from "~/.generated/client";
import { probeIndex } from "~/utils/connectionIndex";
import { select, useConnectionsStore } from "~/utils/connectionsStore";
import { createConnectionKey } from "~/utils/resourceId";

/**
 * Stores credentials for all bucket connections and probes their indexes in
 * parallel. Safe to call from multiple routes — probeIndex is a no-op if a
 * connection is already loading or ready.
 */
export function useInitConnections(
  bucketConfigs: ConnectionConfig[],
  credentials: Record<string, Credentials>,
) {
  const setConnection = useConnectionsStore(select.setConnection);

  useEffect(() => {
    for (const config of bucketConfigs) {
      const creds = credentials[config.name];
      if (!creds) continue;

      const connKey = createConnectionKey(
        config.provider,
        config.name,
        config.prefix,
      );

      setConnection(connKey, creds, config);
      probeIndex(connKey, config.provider, config.name, config.prefix);
    }
  }, [credentials, bucketConfigs, setConnection]);
}
