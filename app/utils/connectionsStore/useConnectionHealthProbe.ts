import { useEffect } from "react";

import { useConnectionsStore } from "./useConnectionsStore";
import { mapWithConcurrency } from "~/utils/limitConcurrency";
import { probeConnection } from "~/utils/probeConnection";

const PROBE_CONCURRENCY = 4;

/** A connection the host may probe: credentialed, or public (probes unsigned). */
const isProbeable = (
  connection: { credentials: unknown; provider?: { isPublic: boolean } },
  lockedConnectionIds: readonly string[],
  connectionId: string,
): boolean =>
  !!(connection.credentials || connection.provider?.isPublic) &&
  !lockedConnectionIds.includes(connectionId);

/**
 * Mounted once at the protected layout so the store's `status` reflects real
 * reachability on every surface, not only after a visit to `/connections`.
 */
export function useConnectionHealthProbe() {
  const setConnectionStatuses = useConnectionsStore((s) => s.setConnectionStatuses);
  // Stable primitive key: re-probe only when the loaded connection set changes.
  // A public (credential-less) connection probes unsigned, so it stays in the
  // set; a connection with neither credentials nor a public provider keeps its
  // seeded "error". A gate-locked connection is not browsable at all, so it is
  // never probed.
  const probeKey = useConnectionsStore((s) =>
    Object.entries(s.connections)
      .filter(([id, connection]) =>
        isProbeable(
          connection,
          s.lockedConnections.map((locked) => locked.id),
          id,
        ),
      )
      .map(([id]) => id)
      .sort()
      .join("|"),
  );

  useEffect(() => {
    if (!probeKey) return;
    const controller = new AbortController();
    let cancelled = false;

    const { connections, lockedConnections } = useConnectionsStore.getState();
    const lockedConnectionIds = lockedConnections.map((locked) => locked.id);
    const targets = Object.entries(connections).filter(([id, connection]) =>
      isProbeable(connection, lockedConnectionIds, id),
    );

    void mapWithConcurrency(targets, PROBE_CONCURRENCY, async ([id, connection]) => {
      const result = await probeConnection(
        connection.connectionConfig,
        connection.credentials,
        connection.provider,
        controller.signal,
      );
      if (cancelled) return;
      setConnectionStatuses({
        [id]: {
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
