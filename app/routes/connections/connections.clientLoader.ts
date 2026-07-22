import { type ClientLoaderFunctionArgs } from "react-router";

import type { LoaderData, loadConnections } from "./connections.loader";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import {
  type ConnectionStatusUpdate,
  useConnectionsStore,
} from "~/utils/connectionsStore/useConnectionsStore";
import { mapWithConcurrency } from "~/utils/limitConcurrency";
import { type ConnectionProbeResult, probeConnection } from "~/utils/probeConnection";

const PREVIEW_CONCURRENCY = 4;

/**
 * Per-connection preview + health probe. One bounded-concurrency
 * `ListObjectsV2` doubles as the bucket-card preview and the connection
 * health check; `CorsLikelyError` becomes a card-level CORS warning.
 */
export async function enrichConnectionsWithPreviews({
  request,
  serverLoader,
}: ClientLoaderFunctionArgs): Promise<LoaderData> {
  const server = await serverLoader<typeof loadConnections>();
  const signal = request.signal;

  const probes = await mapWithConcurrency(
    server.connectionConfigs,
    PREVIEW_CONCURRENCY,
    async (config): Promise<ConnectionProbeResult> => {
      if (signal.aborted) return { status: "connected" };
      const creds = server.credentials[config.name];
      if (!creds) {
        return { status: "error", errorMessage: "No credentials available for this connection." };
      }
      const provider = useConnectionsStore.getState().connections[config.name]?.provider;
      return probeConnection(config, creds, provider, signal);
    },
  );

  const connectionStatuses: Record<string, ConnectionStatusUpdate> = {};
  const nodes: TreeNode[] = server.nodes.map((node, i) => {
    const probe = probes[i];
    connectionStatuses[node.connectionId ?? node.connectionName] = {
      status: probe.status,
      statusMessage: probe.errorMessage,
    };
    return {
      ...node,
      ...(probe.previewObj ? { _Object: probe.previewObj } : {}),
    };
  });

  return { ...server, nodes, connectionStatuses };
}

enrichConnectionsWithPreviews.hydrate = true;
