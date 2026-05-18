import { Credentials } from "@aws-sdk/client-sts";
import { useEffect } from "react";

import { ConnectionConfig } from "~/.generated/client";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

/**
 * Replace the client connections store with the auth-context set. Uses an
 * effect rather than render-time mutation: subscribed descendants would
 * otherwise trip React's "cannot update during render" warning.
 */
export function useInitConnections(
  connectionConfigs: ConnectionConfig[],
  credentials: Record<string, Credentials>,
) {
  const setConnections = useConnectionsStore(select.setConnections);

  useEffect(() => {
    setConnections(connectionConfigs, credentials);
  }, [connectionConfigs, credentials, setConnections]);
}
