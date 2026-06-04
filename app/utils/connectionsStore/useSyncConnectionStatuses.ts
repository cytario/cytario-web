import { useEffect } from "react";

import { select } from "./selectors";
import { useConnectionsStore, type ConnectionStatusUpdate } from "./useConnectionsStore";

/**
 * Push probe results (or any live health update) into the connections store.
 *
 * Subscribes to the store's connection map so the write is re-applied once
 * hydration populates entries: on the initial `clientLoader.hydrate` pass the
 * route loader resolves before the protected layout hydrates the store, so a
 * one-shot write would land on an empty store and no-op. Writes are idempotent
 * (immer no-ops when values are unchanged), so the re-apply converges without a
 * render loop.
 */
export function useSyncConnectionStatuses(updates?: Record<string, ConnectionStatusUpdate>) {
  const setConnectionStatuses = useConnectionsStore((s) => s.setConnectionStatuses);
  const connections = useConnectionsStore(select.connections);

  useEffect(() => {
    // `undefined` when a non-revalidating navigation renders with server-loader
    // data (the probe runs only in the client loader).
    if (updates) setConnectionStatuses(updates);
  }, [updates, connections, setConnectionStatuses]);
}
