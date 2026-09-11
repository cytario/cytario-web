import type { SignedFetch } from "~/utils/signedFetch";

const SPATIAL_ELEMENT_GROUPS = ["images", "points", "labels", "shapes"] as const;

// zarr v3 zarr.json shape: consolidated_metadata is a top-level sibling of
// attributes, not nested inside it (verified against spatialdata 0.8.0 stores).
interface ZarrV3RootNode {
  node_type?: string;
  zarr_format?: number;
  consolidated_metadata?: {
    metadata?: Record<string, { node_type?: string; attributes?: Record<string, unknown> }>;
  };
  attributes?: Record<string, unknown>;
}

interface RootMetadata {
  attributes: Record<string, unknown>;
  consolidated?: { metadata?: Record<string, unknown> };
}

/**
 * Fetch and parse root metadata once — zarr v3 `zarr.json` when present,
 * falling back to v2 `.zattrs` (attributes live at the document root there).
 * Returns null when neither resolves. Fetch failures propagate to the caller.
 */
async function fetchRootMetadata(
  httpsUrl: string,
  signedFetch: SignedFetch,
): Promise<RootMetadata | null> {
  const v3 = await signedFetch(`${httpsUrl.replace(/\/$/, "")}/zarr.json`);
  if (v3.ok) {
    const json = (await v3.json().catch(() => null)) as ZarrV3RootNode | null;
    if (json?.attributes) {
      return {
        attributes: json.attributes,
        consolidated: json.consolidated_metadata,
      };
    }
  }

  const v2 = await signedFetch(`${httpsUrl.replace(/\/$/, "")}/.zattrs`);
  if (v2.ok) {
    const attrs = (await v2.json().catch(() => null)) as Record<string, unknown> | null;
    if (attrs) return { attributes: attrs };
  }

  return null;
}

function hasElementGroupKeys(consolidated: { metadata?: Record<string, unknown> }): boolean {
  const metadata = consolidated.metadata;
  if (!metadata) return false;
  return SPATIAL_ELEMENT_GROUPS.some(
    (group) => Boolean(metadata[group]) && typeof metadata[group] === "object",
  );
}

/** A store is SpatialData when its root attrs say so, or when consolidated
 *  metadata enumerates the spatialdata element groups. */
function isSpatialDataMetadata(metadata: RootMetadata | null): boolean {
  if (!metadata) return false;
  const spatialAttrs = metadata.attributes["spatialdata_attrs"];
  if (spatialAttrs && typeof spatialAttrs === "object" && Object.keys(spatialAttrs).length > 0) {
    return true;
  }
  return metadata.consolidated !== undefined && hasElementGroupKeys(metadata.consolidated);
}

const detectionCache = new Map<string, boolean>();

/**
 * Cheap root-metadata sniff to distinguish a SpatialData `.zarr` store from a
 * plain (OME-)Zarr one. True means the caller should mount the SpatialData
 * viewer; false means fall back to the OME-Zarr viewer. Cached per resourceId
 * — the sniff issues two HTTP requests at most once per resource.
 *
 * A thrown fetch (network failure, CORS) resolves to false rather than
 * rejecting, so the route falls back to the OME-Zarr viewer, which surfaces
 * its own CORS toast — and the failure is deliberately not cached: a
 * transient blip must not pin the wrong viewer for the tab's lifetime.
 */
export async function isSpatialDataStore(
  resourceId: string,
  httpsUrl: string,
  signedFetch: SignedFetch,
): Promise<boolean> {
  const cached = detectionCache.get(resourceId);
  if (cached !== undefined) return cached;

  let result = false;
  try {
    const metadata = await fetchRootMetadata(httpsUrl, signedFetch);
    result = isSpatialDataMetadata(metadata);
  } catch {
    return false;
  }

  detectionCache.set(resourceId, result);
  return result;
}

/** Test-only: clears the per-resourceId sniff cache. */
export function __resetSpatialDataDetectionCache(): void {
  detectionCache.clear();
}
