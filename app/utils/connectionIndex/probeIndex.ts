import { useConnectionsStore } from "~/utils/connectionsStore";

/**
 * Probes whether a connection index Parquet file exists by calling the server-side
 * index-status endpoint (uses HeadObjectCommand -- fast, no DuckDB init needed).
 *
 * Guards against redundant calls: returns early if the index is already loading or ready.
 * Uses `getState()` for each store access to ensure the latest snapshot is read,
 * preventing stale state in async flows.
 */
export async function probeIndex(alias: string): Promise<void> {
  const state = useConnectionsStore.getState();
  const current = state.connections[alias]?.connectionIndex;

  if (current && (current.status === "ready" || current.status === "loading")) {
    return;
  }

  state.setConnectionIndex(alias, {
    status: "loading",
    objectCount: 0,
    builtAt: null,
  });

  try {
    const res = await fetch(`/api/index-status/${alias}`);

    if (!res.ok) {
      useConnectionsStore.getState().setConnectionIndex(alias, {
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
      useConnectionsStore.getState().setConnectionIndex(alias, {
        status: "ready",
        objectCount: data.objectCount,
        builtAt: data.builtAt,
      });
    } else {
      useConnectionsStore.getState().setConnectionIndex(alias, {
        status: "missing",
        objectCount: 0,
        builtAt: null,
      });
    }
  } catch {
    useConnectionsStore.getState().setConnectionIndex(alias, {
      status: "error",
      objectCount: 0,
      builtAt: null,
    });
  }
}
