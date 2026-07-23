import { useEffect } from "react";

import { useConnectionsStore } from "./useConnectionsStore";
import { mapWithConcurrency } from "~/utils/limitConcurrency";
import { probeConnection } from "~/utils/probeConnection";

const PROBE_CONCURRENCY = 4;

/**
 * App-level connection health probe. Mounted once at the protected layout so
 * the store's `status` reflects real reachability on **every** surface
 * (AppHeader global search, sidebar, objects view) — not only after a visit to
 * `/connections`.
 *
 * Reuses the same `probeConnection` (one bounded `ListObjectsV2`) the
 * `/connections` route uses for its card previews. Runs whenever the set of
 * credentialed connections changes (i.e. after `useInitConnections` seeds the
 * store), writing each verdict into the store as it resolves.
 */
export function useConnectionHealthProbe() {
  const setConnectionStatuses = useConnectionsStore((s) => s.setConnectionStatuses);
  // Stable primitive key: re-probe only when the credentialed connection set
  // changes, not on every status write. Credential-less connections can't be
  // probed (no creds to sign with) — they keep their seeded "error".
  const probeKey = useConnectionsStore((s) =>
    Object.values(s.connections)
      .filter((c) => c.credentials)
      .map((c) => c.connectionConfig.id)
      .sort()
      .join("|"),
  );

  useEffect(() => {
    if (!probeKey) return;
    const controller = new AbortController();
    let cancelled = false;

    const targets = Object.values(useConnectionsStore.getState().connections).filter(
      (c) => c.credentials,
    );

    void mapWithConcurrency(targets, PROBE_CONCURRENCY, async (connection) => {
      const result = await probeConnection(
        connection.connectionConfig,
        connection.credentials!,
        connection.provider,
        controller.signal,
      );
      if (cancelled) return;
      setConnectionStatuses({
        [connection.connectionConfig.id]: {
          status: result.status,
          statusMessage: result.errorMessage,
        },
      });
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [probeKey, setConnectionStatuses]);
}
