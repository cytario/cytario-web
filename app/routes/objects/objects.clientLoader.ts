import { type ClientLoaderFunctionArgs } from "react-router";

import type { BucketRouteLoaderResponse, loader } from "./objects.loader";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { formatTruncationMessage } from "~/utils/listingLimits";
import { loadConnectionLevel } from "~/utils/loadConnectionLevel";
import { CorsLikelyError } from "~/utils/signedFetch";

/**
 * Browser-side `ListObjectsV2` issued directly to S3 via SigV4-signed fetch.
 * Server loader supplies auth + connection metadata only.
 */
export const clientLoader = async ({
  request,
  serverLoader,
}: ClientLoaderFunctionArgs): Promise<BucketRouteLoaderResponse> => {
  const serverData = await serverLoader<typeof loader>();

  const resolved = { ...serverData, pendingClientLoad: false };

  // Server already flagged this connection as unreachable (e.g. STS denied
  // AssumeRoleWithWebIdentity). Skip the S3 listing — the route renders the
  // connectionError banner instead.
  if (resolved.connectionError || !resolved.credentials) {
    return { ...resolved, nodes: [] };
  }

  if (resolved.serverDeterminedSingleFile) {
    return { ...resolved, nodes: [], isSingleFile: true };
  }

  try {
    const provider = useConnectionsStore.getState().connections[resolved.connectionId]?.provider;
    const { nodes, isCapped } = await loadConnectionLevel({
      connectionConfig: resolved.connectionConfig,
      credentials: resolved.credentials,
      connectionId: resolved.connectionId,
      connectionName: resolved.connectionName,
      provider,
      urlPath: resolved.urlPath,
      signal: request.signal,
    });

    if (nodes.length === 0) {
      return { ...resolved, nodes: [], isSingleFile: true };
    }

    return {
      ...resolved,
      nodes,
      ...(isCapped
        ? {
            notification: {
              message: formatTruncationMessage(resolved.name),
              status: "warning" as const,
            },
          }
        : {}),
    };
  } catch (error) {
    console.error("Error in objects clientLoader:", error);
    if (error instanceof CorsLikelyError) {
      return {
        ...resolved,
        nodes: [],
        notification: {
          message: `Browser was blocked from reading "${resolved.name}" — likely a CORS misconfiguration on the bucket. Re-check the bucket's CORS policy or contact your administrator.`,
          status: "error",
        },
      };
    }
    return {
      ...resolved,
      nodes: [],
      notification: {
        message:
          "We couldn't load the objects for this bucket. Please check your connection or try again later.",
        status: "error",
      },
    };
  }
};

clientLoader.hydrate = true;
