import { type ClientLoaderFunctionArgs } from "react-router";

import type { BucketRouteLoaderResponse, loader } from "./objects.loader";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { hasZarrStoreRootMarker } from "~/utils/leafDirectory";
import { formatTruncationMessage } from "~/utils/listingLimits";
import { loadConnectionLevel } from "~/utils/loadConnectionLevel";
import { CorsLikelyError } from "~/utils/signedFetch";

/** Browser-side S3 listing via SigV4-signed fetch; server loader supplies auth + metadata only. */
export const clientLoader = async ({
  request,
  serverLoader,
}: ClientLoaderFunctionArgs): Promise<BucketRouteLoaderResponse> => {
  const serverData = await serverLoader<typeof loader>();

  const resolved = { ...serverData, pendingClientLoad: false };

  // Server already flagged this connection as unreachable — skip the S3 listing.
  // A public connection carries no credential but no error either, so it lists.
  if (resolved.connectionError) {
    return { ...resolved, nodes: [] };
  }

  if (resolved.serverDeterminedSingleFile) {
    return { ...resolved, nodes: [], isSingleFile: true };
  }

  if (resolved.urlPath && !resolved.urlPath.endsWith("/")) {
    return { ...resolved, nodes: [], isSingleFile: true };
  }

  try {
    // Prefer the loader-supplied projection — on first navigation after a
    // create, the store has not been seeded with the new connection yet and a
    // store-only read would list against the default AWS endpoint.
    const provider =
      resolved.provider ??
      useConnectionsStore.getState().connections[resolved.connectionId]?.provider;
    const { nodes, isCapped } = await loadConnectionLevel({
      connectionConfig: resolved.connectionConfig,
      credentials: resolved.credentials,
      connectionId: resolved.connectionId,
      connectionName: resolved.connectionName,
      provider,
      urlPath: resolved.urlPath,
      signal: request.signal,
    });

    // A directory whose own level carries a zarr store root marker
    // (`.zgroup`/`.zarray`/`zarr.json`) is one logical store, not a browsable
    // folder — dispatch to the viewer path like the extension-named leaf
    // directories already handled above. Content decides; the directory's
    // name is irrelevant. The listing is already in hand; no extra S3
    // request. Extension-named leaf/companion directories never reach this
    // branch (serverDeterminedSingleFile short-circuited), so the check can
    // only claim directories that are zarr stores by their own contents.
    // `nodes` carries only this directory's direct children (buildLevelTree),
    // so the file names are exactly the directory's own level.
    const markerNames = nodes.filter((n) => n.type === "file").map((n) => n.name);
    if (hasZarrStoreRootMarker(markerNames)) {
      return { ...resolved, nodes: [], isSingleFile: true, isStoreDirectory: true };
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
          message: `Browser was blocked from reading "${resolved.name}" — either a CORS misconfiguration on the bucket, or the host is not permitted by the app's Content-Security-Policy. Contact your administrator.`,
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
