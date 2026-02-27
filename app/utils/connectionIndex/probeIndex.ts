import { useConnectionsStore } from "~/utils/connectionsStore";

/**
 * Probes whether a connection index Parquet file exists by calling the server-side
 * index-status endpoint (uses HeadObjectCommand — fast, no DuckDB init needed).
 * Does NOT trigger a rebuild — that's a separate user action.
 */
export async function probeIndex(
  connectionKey: string,
  provider: string,
  bucketName: string,
  prefix: string,
): Promise<void> {
  const state = useConnectionsStore.getState();
  const current = state.connections[connectionKey]?.connectionIndex;

  if (current && (current.status === "ready" || current.status === "loading")) {
    return;
  }

  state.setConnectionIndex(connectionKey, {
    status: "loading",
    objectCount: 0,
    builtAt: null,
  });

  try {
    const params = new URLSearchParams();
    if (prefix) params.set("prefix", prefix);
    const qs = params.size > 0 ? `?${params.toString()}` : "";

    const res = await fetch(
      `/api/index-status/${provider}/${bucketName}${qs}`,
    );

    if (!res.ok) {
      useConnectionsStore.getState().setConnectionIndex(connectionKey, {
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
      useConnectionsStore.getState().setConnectionIndex(connectionKey, {
        status: "ready",
        objectCount: data.objectCount,
        builtAt: data.builtAt,
      });
    } else {
      useConnectionsStore.getState().setConnectionIndex(connectionKey, {
        status: "missing",
        objectCount: 0,
        builtAt: null,
      });
    }
  } catch {
    useConnectionsStore.getState().setConnectionIndex(connectionKey, {
      status: "error",
      objectCount: 0,
      builtAt: null,
    });
  }
}
