import { useConnectionsStore } from "~/utils/connectionsStore";

/**
 * Probes whether a connection index Parquet file exists by calling the server-side
 * index-status endpoint (uses HeadObjectCommand -- fast, no DuckDB init needed).
 *
 * Guards against redundant calls: returns early if the index is already loading or ready.
 * Uses `getState()` for each store access to ensure the latest snapshot is read,
 * preventing stale state in async flows.
 */
export async function probeIndex(connectionName: string): Promise<void> {
  const state = useConnectionsStore.getState();
  const current = state.connections[connectionName]?.connectionIndex;

  if (current && (current.status === "ready" || current.status === "loading")) {
    return;
  }

  state.setConnectionIndex(connectionName, {
    status: "loading",
    objectCount: 0,
    builtAt: null,
  });

  try {
    const res = await fetch(`/api/index-status/${connectionName}`);

    if (!res.ok) {
      useConnectionsStore.getState().setConnectionIndex(connectionName, {
        status: "error",
        objectCount: 0,
        builtAt: null,
      });
      return;
    }

    const data = (await res.json()) as
      | { exists: true; objectCount: number; builtAt: string | null }
      | { exists: false };

    if (data.exists) {
      useConnectionsStore.getState().setConnectionIndex(connectionName, {
        status: "ready",
        objectCount: data.objectCount,
        builtAt: data.builtAt,
      });
    } else {
      useConnectionsStore.getState().setConnectionIndex(connectionName, {
        status: "missing",
        objectCount: 0,
        builtAt: null,
      });
    }
  } catch {
    useConnectionsStore.getState().setConnectionIndex(connectionName, {
      status: "error",
      objectCount: 0,
      builtAt: null,
    });
  }
}
